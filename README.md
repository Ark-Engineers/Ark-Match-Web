# arkMatchWeb

arkMatchWeb 是一个基于 Vue 3 + Vite + TypeScript 的前端工程，已实现独立的登录/注册页面，并将后端登录注册接口完整集成到前端页面代码中；支持用户类型识别（管理员/普通用户）、按身份自动跳转、登录后身份标识展示，以及完整登出（清理前端存储与缓存并回到登录页）。

## 功能要求（已落地）

### 1) 页面架构（仅 2 个核心页面）

- 登录页：`/login`（页面内完成接口调用、异常捕获、错误提示、表单校验）
- 注册页：`/register`（页面内完成接口调用、异常捕获、错误提示、表单校验）

### 2) 用户类型识别与自动跳转

- 登录成功后解析后端返回的 `role` 字段：
  - `ADMIN` → 跳转到 `/admin/dashboard`
  - 其他（默认普通用户）→ 跳转到 `/user/home`
- 登录后专属页面顶部显眼位置展示身份文字提示：
  - 管理员页显示：当前登录身份：管理员
  - 普通用户页显示：当前登录身份：普通用户

### 3) 完整登出（必须防止未授权访问）

- 管理员页与普通用户页均提供显眼的登出按钮
- 点击登出会执行：
  - 调用后端 `POST /auth/logout`（可携带 refreshToken）
  - 清除前端身份状态：localStorage / sessionStorage 中的 token 与用户信息
  - 清除浏览器 CacheStorage（若存在）
  - 强制跳转回 `/login`，并触发页面 reload，避免残留状态导致的未授权访问

### 4) 基础校验与错误提示

- 登录/注册页提交前进行合法性校验：
  - 手机号：11 位、以 1 开头（仅当输入为纯数字时按手机号规则校验）
  - 账号：`3-32` 位字母/数字/下划线
  - 邮箱：基本格式校验
  - 密码：仅校验非空（不做长度提示）
- 所有接口调用具备基础异常捕获，页面展示清晰的错误提示信息

## 路由说明

- 访客页：
  - `/login`
  - `/register`
- 登录后页面（受保护）：
  - `/admin/dashboard`（仅管理员）
  - `/user/home`（仅普通用户）
- 未登录访问受保护路由会被拦截并跳转到 `/login`
- 已登录访问 `/login` 或 `/register` 会按身份自动重定向到对应主页

路由与守卫位置：
- `src/router/index.ts`
- `src/router/modules/*.ts`

## 接口对接规范

后端鉴权接口（dateOrFriends）：
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `POST /auth/logout`

统一响应结构：
- `ApiResponse<T> = { code: number; message: string; data: T }`
- 登录成功 `data` 内包含 `accessToken / refreshToken / role / userId` 等字段

前端请求约定：
- Axios 封装：`src/api/request.ts`
- 会自动在请求头注入 `Authorization: <tokenType> <accessToken>`（默认 Bearer）

## 本地开发（推荐流程）

### 0) 前置条件

- Node.js（建议与 `package.json` 的 engines 对齐）
- pnpm
- 后端服务已在本机启动并监听 `http://127.0.0.1:8888`（dev profile 默认端口为 8888）

### 1) 安装依赖

```sh
pnpm install
```

### 2) 启动前端（dev）

```sh
pnpm dev
```

### 3) Type Check / Build

```sh
pnpm run type-check
pnpm build
```

## 环境变量与代理（解决 CORS 的关键）

本项目在 dev 环境通过 Vite proxy 转发到后端，避免浏览器跨域：

- 环境文件：`env/.env.dev`
- 推荐配置：
  - `VITE_API_BASE_URL=/api`
  - `VITE_PROXY_PREFIX=/api`
  - `VITE_PROXY_TARGET=http://127.0.0.1:8888`

效果：
- 浏览器请求：`http://localhost:5173/api/auth/login`
- Vite 转发为：`http://127.0.0.1:8888/auth/login`

修改 env 后必须重启 dev server 才会生效。

## 目录结构（核心）

- `src/views/auth/login/index.vue`：登录页（接口调用与校验逻辑在页面内）
- `src/views/auth/register/index.vue`：注册页（接口调用与校验逻辑在页面内）
- `src/views/admin/dashboard/index.vue`：管理员专属页（身份提示 + 登出）
- `src/views/user/home/index.vue`：普通用户专属页（身份提示 + 登出）
- `src/stores/auth.ts`：登录态（token/role）存储与清理
- `src/api/request.ts`：Axios 实例与拦截器
- `src/router/index.ts`：全局守卫（requiresAuth/role/guestOnly）

## 常见问题排查

### 1) `ERR_CONNECTION_TIMED_OUT`

- 后端未启动 / 端口不通
- `env/.env.dev` 的 `VITE_PROXY_TARGET` 指向错误

### 2) CORS 报错（`No 'Access-Control-Allow-Origin' header`）

- 说明浏览器在直连后端（例如 `http://127.0.0.1:8888/auth/login`）
- 请确认：
  - `VITE_API_BASE_URL` 是否为 `/api`
  - 前端是否重启
  - Network 面板里请求是否变成 `http://localhost:5173/api/...`
