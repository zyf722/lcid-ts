**English** | [简体中文](README.zh-hans.md)

# LCid-TS

> [!NOTE]
>
> This is a TypeScript implementation of [LCid](https://github.com/bunnyxt/lcid), in order to make it run on Cloudflare Workers.

## Introduction

Here's an introduction from the original project's README:

> This simple project, called LCid, provides directly access to LeetCode problems via id. Features:
> 
> - Fetch all LeetCode problems via crawler.
> - Redirect to LeetCode problem page with problem id in the URL path via backend.
> - Support both LeetCode [global site](https://leetcode.com/problemset/all/) and [China site](https://leetcode-cn.com/problemset/all/) redirect.

LCid-TS uses Cloudflare Workers to provide the same functionality:
- A cron-scheduled job fetches all LeetCode problems and stores all problem as a JSON string into a [Cloudflare KV](https://developers.cloudflare.com/kv/) namespace.
  - Due to the request limitation of Cloudflare Workers, the problems are stored in a "complete" JSON string, instead of saving them as individual KV pairs.
- Each time a request is made to the Worker, it fetches the problem list from the KV namespace and redirects the user to the corresponding LeetCode problem page.
- **No frontend is provided**, which means the worker only serves as a backend API.

## Deployment
To deploy this project, you need to clone this repository and install the dependencies:

```bash
git clone https://github.com/zyf722/lcid-ts.git
cd lcid-ts
npm install
```

Then you should edit [wrangler.toml](./wrangler.toml) based on the [example](./wrangler.toml.example):
- `crons`: The cron schedule for the Worker to fetch the problems.
- `bindings`: The KV namespace binding for the Worker to store the problems.
- `id`: The ID of the KV namespace.

After that, you need to login to your Cloudflare account, publish the Worker and create the KV namespace:

```bash
npx wrangler login
npx wrangler publish
npx wrangler kv:namespace create <namespace_name>
```

You also need to set up the secrets to make the crawler work:

```bash
npx wrangler secret put LC_CF_CLEARANCE
npx wrangler secret put LC_CSRFTOKEN
```

You can retrieve the values of `LC_CF_CLEARANCE` and `LC_CSRFTOKEN` by logging into LeetCode and inspecting the cookies.

Finally, you can deploy the Worker with the following command:

```bash
npm run deploy
```

> [!NOTE]
>
> If this is your first time deploying the Worker, you may want to manually add the `problem_json` entry to your KV namespace in the Cloudflare dashboard, as the Worker will only update it automatically after the first cron job.

Check [real-time logs](https://developers.cloudflare.com/workers/observability/logging/real-time-logs/) to see if the Worker is running correctly.