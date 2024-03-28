import { Router } from "@tsndr/cloudflare-worker-router";

type ConsoleLevel = "log" | "info" | "error" | "warn";
class Logger {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    format(message: string, level: ConsoleLevel): void {
        console[level](`[${level}] ${this.name}: ${message}`);
    }

    debug(message: string): void {
        this.format(message, "log");
    }

    info(message: string): void {
        this.format(message, "info");
    }

    error(message: string): void {
        this.format(message, "error");
    }

    warn(message: string): void {
        this.format(message, "warn");
    }
}
const log = new Logger("LCID");	

const router = new Router<Env>();
router.cors();

interface ServerError {
	code: number;
	message: string;
}

function isServerError(obj: unknown): obj is ServerError {
    return (obj as ServerError).code !== undefined;
}

async function loadProblemJSON(env: Env): Promise<ServerError | string> {
    const problemJSON = await env.problems.get("problem_json");
    if (!problemJSON) {
        log.error("Cannot load problems from KV.");
        return { code: 500, message: "Cannot load problems from KV." };
    }
    return problemJSON;
}

async function loadProblem(env: Env, problemID: string): Promise<ServerError | Question> {
    const problemJSON = await loadProblemJSON(env);
    if (isServerError(problemJSON)) {
        return problemJSON;
    }
    const problems = JSON.parse(problemJSON);
    const problem = problems[problemID];
    if (!problem) {
        log.error(`Cannot find problem ${problemID}.`);
        return { code: 404, message: `Cannot find problem ${problemID}.` };
    }
    return problem;
}

router.get("/:problem_id", async ({ req, env }) => {
    const problem = await loadProblem(env, req.params.problem_id);
    if (isServerError(problem)) {
        return new Response(JSON.stringify(problem), { status: problem.code });
    }
    return Response.redirect(`https://leetcode.com/problems/${problem.titleSlug}/`);
});

router.get("/cn/:problem_id", async ({ req, env }) => {
    const problem = await loadProblem(env, req.params.problem_id);
    if (isServerError(problem)) {
        return new Response(JSON.stringify(problem), { status: problem.code });
    }
    return Response.redirect(`https://leetcode-cn.com/problems/${problem.titleSlug}/`);
});

router.get("/info", async ({ env }) => {
    const problemJSON = await loadProblemJSON(env);
    if (isServerError(problemJSON)) {
        return new Response(JSON.stringify(problemJSON), { status: problemJSON.code });
    }
    return new Response(problemJSON, {
        headers: {
            "Content-Type": "application/json",
        },
    });
});

router.get("/info/:problem_id", async ({ req, env }) => {
    const problem = await loadProblem(env, req.params.problem_id);
    if (isServerError(problem)) {
        return new Response(JSON.stringify(problem), { status: problem.code });
    }
    return new Response(JSON.stringify(problem), {
        headers: {
            "Content-Type": "application/json",
        },
    });
});

// Problems Fetching & Updating to KV

interface Question {
    acRate: number;
    difficulty: string;
    likes: number;
    dislikes: number;
    categoryTitle: string;
    frontendQuestionId: string;
    paidOnly: boolean;
    title: string;
    titleSlug: string;
    topicTags: {
        name: string;
        id: string;
        slug: string;
    }[];
    hasSolution: boolean;
    hasVideoSolution: boolean;
    totalAcceptedRaw?: number;
    totalSubmissionRaw?: number;
	stats: string;
}

interface ResponseContent {
    data: {
        problemsetQuestionList: {
            total: number;
            questions: Question[];
        };
    };
}

function isResponseContent(obj: unknown): obj is ResponseContent {
    return (obj as ResponseContent).data !== undefined;
}

async function fetchProblems(cfClearance: string, csrftoken: string, limit = 50): Promise<ResponseContent> {
    const cookie = `cf_clearance=${cfClearance}; csrftoken=${csrftoken}`;
    const data = {
        query: `
			query problemsetQuestionList(
				$categorySlug: String,
				$limit: Int,
				$skip: Int,
				$filters: QuestionListFilterInput
			) {
				problemsetQuestionList: questionList(
					categorySlug: $categorySlug
					limit: $limit
					skip: $skip
					filters: $filters
				) {
					total: totalNum
					questions: data {
						acRate
						difficulty
						likes
						dislikes
						categoryTitle
						frontendQuestionId: questionFrontendId
						paidOnly: isPaidOnly
						title
						titleSlug
						topicTags {
							name
							id
							slug
						}
						hasSolution
						hasVideoSolution
					}
				}
			}
		`,
        variables: {
            categorySlug: "",
            skip: 0,
            limit,
            filters: {},
        },
    };

    const response = await fetch("https://leetcode.com/graphql/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
            "X-Csrftoken": csrftoken,
        },
        body: JSON.stringify(data),
    });

    const responseData = await response.json();
    if (responseData && isResponseContent(responseData)) {
        return responseData;
    }

    log.error("Failed to fetch problems from LeetCode:", responseData);
    throw new Error("Failed to fetch problems from LeetCode");
}

async function updateProblems(event: ScheduledEvent, env: Env) {
    log.info("Now load cf_clearance and csrftoken...");
    const cfClearance = env.LC_CF_CLEARANCE;
    const csrftoken = env.LC_CSRFTOKEN;
    if (!cfClearance || !csrftoken) {
        log.error("Fail to load cf_clearance and csrftoken from environment!");
        throw new Error("Fail to load cf_clearance and csrftoken from environ");
    }
    log.info("Done loading cf_clearance and csrftoken.");

    log.info("Now fetch problems from LeetCode...");
    const responseContent = await fetchProblems(cfClearance, csrftoken);
    const total_count = responseContent.data.problemsetQuestionList.total;
    log.info(`Found ${total_count} problems in total.`);

    log.info(`Now try fetch all ${total_count} LeetCode problems...`);
    const responseContentAll = await fetchProblems(cfClearance, csrftoken, total_count);

    if (responseContentAll.data.problemsetQuestionList.questions.length !== total_count) {
        log.error("Failed to fetch all problems.");
        throw new Error("Failed to fetch all problems.");
    }

    const questionsAll: { [problemID: string]: Question } = {};
    responseContentAll.data.problemsetQuestionList.questions.forEach(async (q) => {
        const questionStatsJson = q.stats;
        let totalAcceptedRaw: number | undefined;
        let totalSubmissionRaw: number | undefined;
        try {
            const questionStatsDict = JSON.parse(questionStatsJson);
            totalAcceptedRaw = questionStatsDict.totalAcceptedRaw;
            totalSubmissionRaw = questionStatsDict.totalSubmissionRaw;
        } catch {
            // Ignore parsing errors
        }

        questionsAll[q.frontendQuestionId] = {
            ...q,
            totalAcceptedRaw,
            totalSubmissionRaw,
        };
    });
    log.info(`All ${total_count} problems fetched.`);

    await env.problems.put("problem_json", JSON.stringify(questionsAll));
}

export interface Env {
	// KV Namespace for storing problems
	problems: KVNamespace;

	// cfClearance and csrftoken, as secrets
	LC_CF_CLEARANCE: string;
	LC_CSRFTOKEN: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: EventContext<Env, any, any>) {
        // Fetch problems from LeetCode
        ctx.waitUntil(updateProblems(event, env));
    },
};
