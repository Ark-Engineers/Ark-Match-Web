# arkMatchWeb（罗德之门 Ark Match 前端）

罗德之门（Ark Match）的 Web 前端。为《明日方舟》玩家打造的同频交友平台：通过多维问卷评估，智能匹配兴趣、玩法与价值观相近的干员玩家。

技术栈：**Vue 3 + Vite 8 + TypeScript + Pinia + Vue Router + axios**，样式 **Tailwind CSS 4**（用户端）+ **Element Plus**（后台）。

> 本仓库仅包含前端。后端见独立仓库 `Ark-Match-Server`。

---

## 部署指南

### 1) 前端产物与 API 约定

- 前端所有请求走相对路径 `VITE_API_BASE_URL=/api`，即浏览器请求 `<你的域名>/api/...`。
- 因此生产环境需要一个反向代理把 `/api` 转发到后端，并**去掉 `/api` 前缀**。
- 后端默认地址：`http://www.chenmyserver.cn:8888`（部署时替换成你自己的后端地址 / 域名）。

### 2) 构建

```sh
pnpm install
pnpm build
```

- 类型检查 + 生产构建一条龙。
- 产物输出到 `dist-YYYYMMDD/`，`scripts/postbuild.mjs` 会自动把最新一份同步为 `dist/`（最终部署取 `dist/` 内容）。

### 3) 托管 + 反向代理（以 Nginx 为例）

把 `dist/` 的内容上传到服务器 webroot，配置 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/arkmatch-web/dist;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 前端 API 反向代理到后端（去掉 /api 前缀）
    location /api/ {
        proxy_pass http://www.chenmyserver.cn:8888/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> `proxy_pass .../` 结尾带斜杠会去除 `/api` 前缀；例如 `/api/auth/login` → `http://backend:8888/auth/login`。

### 4) 其他托管方式

- **静态托管（OSS / CDN / GitHub Pages 等）**：仍可部署 `dist/`，但需要一个网关/CDN 规则把 `/api/` 请求转发到后端并去掉前缀，否则接口 404。
- 若后端与前端**同源部署**（Nginx 已代理 `/api`），无需额外跨域配置。

---

## 环境变量

配置文件目录：`env/`

| 变量 | dev 示例 | 作用 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | 所有请求的相对基础路径 |
| `VITE_PORT` | `5173` | dev server 端口 |
| `VITE_PROXY_TARGET` | `http://www.chenmyserver.cn:8888` | dev 代理转发后端（仅 dev） |
| `VITE_ASSET_BASE` | `/` | Vite 资源 `base`，可部署到子路径 |
| `VITE_DROP_CONSOLE` | `false` | prod 是否去除 console |
| `VITE_PROD_DOMAIN` | `www.chenmyserver.cn` | 生产域名 |
| `VITE_LMD_SIGN_SECRET` | （dev 内置示例值） | 管理后台龙门币写操作 HMAC 签名密钥，必须与后端 `LMD_SIGN_SECRET` 一致 |

修改 env 后需重启 dev / 重新构建才生效。

---

## 本地开发

### 前置条件

- Node.js `^20.19.0 || >=22.12.0`
- pnpm
- （可选）本地后端；否则 dev 代理直连在线后端 `www.chenmyserver.cn:8888`

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

Dev 代理（`vite.config.ts`）：`/api/*` → `VITE_PROXY_TARGET`，自动去掉 `/api` 前缀，解决开发期 CORS。

### 校验与构建

```sh
pnpm run type-check   # vue-tsc 类型检查
pnpm build            # type-check + 生产构建
```

---

## 页面与功能

- **落地页（首页）** `/`：整屏滚动（问卷填写 / 个人中心 / 项目主页），含快速开始、登录引导。
- **问卷**：后端驱动的多题型问卷（单选 / 判断 / `多选_X` / 填空）+ 父子题联动，未登录可先作答、登录后自动提交；含问卷刷新回显页。
- **个人中心 / 编辑资料**：头像（干员 CDN）、主打干员、简介、生日、标签、QQ/微信/邮箱。
- **匹配**：匹配状态、待确认匹配、匹配详情。
- **通知 / 公告**（站内通知支持带龙门币的邮件，可一键领取）、**封禁申诉**、**登录 / 注册**（独立页 + 弹窗）。
- **龙门币**：用户端钱包页 `/user/lmd`（余额 + 流水翻页）；个人资料页显示余额并可跳转流水。
- **管理后台**（仅管理员）：问卷管理、用户管理、公告、龙门币管理（余额调整 / 发布龙门币邮件 / 流水与领取审计 / 账面校验）、仪表盘等（基于 Element Plus）。

核心页面目录：`src/views/user/**`（每个页面一个文件夹）。

---

## 目录结构（核心）

```
env/                        环境变量（dev / prod / example）
public/                     logo、背景图等静态资源
scripts/postbuild.mjs       构建后把 dist-YYYYMMDD 同步到 dist/
src/
  api/                      axios 封装（request.ts）、各功能接口
  components/               通用组件（Ui*、SurveyEngine，sections 内为落地页区块）
  composables/              组合式函数（useSurveyEngine 等）
  config/                   API_BASE_URL 等全局配置
  router/                   modules/ 按模块拆分路由 + 全局守卫
  stores/                   Pinia（auth / ui / notification / survey / match …）
  utils/                    存储、封禁拦截等工具
  views/                    auth(登录注册) / user(用户端) / admin(后台)
  App.vue / main.css / main.ts
vite.config.ts / envDir=env
```

## 关键约定

- 鉴权：`request.ts` 拦截器自动注入 `Authorization`；`401` 自动清登录态，重登返回落地页。
- 头像资源：干员头像 CDN `https://web.hycdn.cn/arknights/game/assets/char/avatar/{charId}.png`（前端按 `charId` 拼 URL，无 `charId` 回落后端 `avatarUrl`）。
- 头像列表：前端直连森空岛干员图鉴接口获取（`src/api/arknights-avatar.ts`，skland 开放跨域，无需后端代理）。
- 官方账号绑定：鹰角/森空岛接口走 `/thirdparty/*` 同源代理（`src/api/hypergryph.ts`）；森空岛校验的设备 dId 由数美设备指纹服务签发（`src/api/device-fingerprint.ts`，走 `/thirdparty/fp` 代理，代理需剥离 Origin/Referer），随机生成的 dId 会被判 10001 设备信息无效。
- 头像 `<img>` 统一加 `referrerpolicy="no-referrer"` 规避 CDN 防盗链。
- 龙门币领取：带龙门币的通知在通知页显示“领取”按钮，先换取一次性票据（`requestClaimTicket`）再凭票据领取（`claimLmdMail`），每封仅可领取一次，过期/已领取由前端按接口返回状态展示。
- 龙门币后台签名：管理后台龙门币写操作（余额调整 / 发布邮件）走 `src/api/admin/lmd.ts`，用 `crypto.subtle` 对请求体做 HMAC-SHA256 签名（时间戳窗口 + 随机数防重放），密钥来自 `VITE_LMD_SIGN_SECRET`，与后端 `LMD_SIGN_SECRET` 保持一致；字符串拼接前两侧必须同样 trim，否则签名校验失败。

## 常见问题排查

1. **接口 401 / 拿不到数据**：确认反向代理的 `/api` 已正确转发到后端并去掉前缀；检查 Network 里请求地址。
2. **CORS `No 'Access-Control-Allow-Origin'`**：浏览器直连了后端，应走 `VITE_API_BASE_URL=/api` 同源代理。
3. **dev 起不来**：确认 Node 版本符合 engines，pnpm 已安装依赖。