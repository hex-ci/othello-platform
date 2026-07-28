# 贡献指南

感谢你对 Othello Platform 的关注！本文档说明如何参与贡献。

## 开发环境

- Node.js ≥ 22、pnpm ≥ 11、Docker
- 启动流程见 [README.md](./README.md#快速开始)

## 开发流程

1. Fork 本仓库并创建 feature 分支（`git checkout -b feat/xxx`）
2. 编写代码，遵循下方代码规范
3. 本地验证三件套全绿：

   ```bash
   pnpm -r typecheck
   pnpm lint
   pnpm -r test
   ```

4. 按 [Conventional Commits](https://www.conventionalcommits.org/) 提交
5. 发起 Pull Request，填写模板，说明改动动机与测试方式

## 代码规范

- **Prettier**：无分号、单引号、`trailingComma: all`、`printWidth: 100`、2 空格缩进
- **TypeScript strict + `noUncheckedIndexedAccess`**：索引访问返回 `T | undefined`，必须处理
- **`verbatimModuleSyntax`**：类型-only 导入用 `import type { ... }`
- **命名**：文件 kebab-case、类型 PascalCase、变量 camelCase、常量 SCREAMING_SNAKE_CASE
- **WS 事件** snake_case；**REST 路径** kebab-case 复数，`/api/v1` 前缀
- **棋子常量**：`T_NONE=0, T_BLACK=1, T_WHITE=2`，禁止魔法数字
- **错误格式**：REST `{ error: { code, msg } }`，WS `{ type: 'error', payload: { code, msg } }`

详见 [CLAUDE.md](./CLAUDE.md) 与 [docs/appendix-a-glossary-and-conventions.md](./docs/appendix-a-glossary-and-conventions.md)。

## 架构约定

- `packages/shared` 是契约单一来源，改动 WS/REST 契约须同步前后端
- `packages/engine` 纯函数、零副作用，不持有状态
- 前端界面对照 `docs/pages/*.html` 设计稿

## 提交规范

使用 Conventional Commits 前缀：`feat: / fix: / refactor: / docs: / test: / chore: / perf: / ci:`

## Issue

- Bug 报告与功能请求请使用对应的 Issue 模板
- 安全漏洞请**不要**公开提交 Issue，见 [SECURITY.md](./SECURITY.md)

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
