[English](README.md) | **简体中文**

# LCid-TS

> [!NOTE]
>
> 这是 [LCid](https://github.com/bunnyxt/lcid) 项目的 TypeScript 实现，旨在使其在 Cloudflare Workers 上运行。

## 介绍

以下介绍部分来自于原项目 README：

> 这个名为 LCid 的简单项目，提供了直接通过 id 访问 LeetCode 问题的功能。特性：
>
> - 通过爬虫获取所有 LeetCode 问题。
> - 通过后端，使用 URL 路径中的问题 id 重定向到 LeetCode 问题页面。
> - 支持重定向到 LeetCode [全球站点](https://leetcode.com/problemset/all/) 和 [中国站点](https://leetcode-cn.com/problemset/all/)。

LCid-TS 使用 Cloudflare Workers 提供相同的功能：
- 一个定时任务获取所有 LeetCode 问题，并将所有问题作为 JSON 字符串存储到 [Cloudflare KV](https://developers.cloudflare.com/kv/) 命名空间。
  - 由于 Cloudflare Workers 的请求限制，问题被存储为一个 "完整" 的 JSON 字符串，而不是将它们保存为单独的 KV 对。
- 每次向 Worker 发送请求时，它都会从 KV 命名空间获取问题列表，并将用户重定向到相应的 LeetCode 问题页面。
- **不提供前端**，这意味着 Worker 仅作为后端 API。

## 部署
要部署此项目，你需要克隆此仓库并安装依赖项：

```bash
git clone https://github.com/zyf722/lcid-ts.git
cd lcid-ts
npm install
```

然后你应该根据 [示例](./wrangler.toml.example) 编辑 [wrangler.toml](./wrangler.toml)：
- `crons`：Worker 获取问题的定时任务的 cron 表达式。
- `bindings`：Worker 存储问题的 KV 命名空间绑定。
- `id`：KV 命名空间的 ID。

之后，你需要登录到你的 Cloudflare 账户、发布 Worker 并创建 KV 命名空间：

```bash
npx wrangler login
npx wrangler publish
npx wrangler kv:namespace create <namespace_name>
```

你还需要设置 secrets 以使爬虫正常工作：

```bash、
npx wrangler secret put LC_CF_CLEARANCE
npx wrangler secret put LC_CSRFTOKEN
```

你可以通过登录 LeetCode 并检查 cookies 来获取 `LC_CF_CLEARANCE` 和 `LC_CSRFTOKEN` 的值。

最后，你可以使用以下命令部署 Worker：

```bash
npm run deploy
```

> [!NOTE]
>
> 如果这是你第一次部署该 Worker，你可能需要手动在 Cloudflare 仪表板中添加 `problem_json` 条目到你的 KV 命名空间使其正常工作，因为 Worker 只会在第一次定时任务后自动更新它。

检查 [实时日志](https://developers.cloudflare.com/workers/observability/logging/real-time-logs/) 以查看 Worker 是否正在正确运行。