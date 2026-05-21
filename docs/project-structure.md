# 项目结构约定

本项目基于 Vue 3 + Vite + TypeScript，采用“按领域分模块”的目录组织方式，方便扩展与维护。

## src 目录

### env（根目录）

- `env/.env.dev`：开发环境变量（执行 `npm run dev` 自动加载）
- `env/.env.prod`：生产环境变量（执行 `npm run build`/`npm run preview` 自动加载）
- `env/.env.example`：配置模板（可提交到仓库）
- 加载机制：Vite 标准 env 优先级（同一目录内 `.env` < `.env.local` < `.env.{mode}` < `.env.{mode}.local`），本项目通过 `vite.config.ts` 的 `envDir` 指向 `env/`

### src/api

- `src/api/request.ts`：axios 实例与 `request()` 基础封装
- `src/api/index.ts`：统一导出入口
- **接口模块约定**：一个接口模块对应一个文件夹，文件夹内放同名 `.ts`
  - 例：`src/api/user/user.ts`
  - 例：`src/api/match/match.ts`
  - 例：`src/api/admin/admin.ts`

### src/views

- `src/views/admin/`：管理端页面（只允许按页面/模块建文件夹）
- `src/views/user/`：用户端页面（只允许按页面/模块建文件夹）
- `src/views/common/`：通用页面（例如 404）

#### views 目录规范（强制）

1. `views` 下仅存在 `admin` 与 `user` 两个顶级目录；所有新增页面/模块必须在对应顶级目录下创建“专属独立文件夹”，禁止直接在 `admin` 或 `user` 下放零散 `.vue` 文件。
2. 若页面存在子页面/局部可复用组件，必须放在该页面文件夹内的 `components/` 子目录中。
3. 每个页面文件夹必须包含入口页面文件 `index.vue`；`components/` 中只允许存放子组件，不允许放独立页面入口文件。
4. 新增文件严格遵循以上规范，保持结构一致，便于维护与迭代。

### src/router

- `src/router/index.ts`：创建 Router 实例
- `src/router/modules/`：按模块拆分路由
  - `src/router/modules/index.ts`：汇总所有模块路由

### src/config

- `src/config/index.ts`：全局配置入口
- `VITE_API_BASE_URL`：接口基础地址（从 `import.meta.env` 读取）

### src/utils

- `src/utils/`：通用工具函数（不与业务强绑定）

### src/assets

- `src/assets/`：全局静态资源与基础样式

## 路由示例

- `/match` → `src/views/user/match/index.vue`
- `/user` → `src/views/user/user/index.vue`
- `/admin` → `src/views/admin/admin/index.vue`
- `/:pathMatch(.*)*` → `src/views/common/not-found/index.vue`
