# 问卷填写与匹配（MVP 需求说明）

## 1. 目标

- 在用户端提供“填写问卷”的完整界面与流程
- 用户提交后将答卷写入数据库
- 用户重新填写时，旧答卷作废（仅保留最新一份有效答卷）
- 基于用户答卷数据，输出“匹配结果/推荐列表”

## 2. 范围与非范围

### 2.1 范围（本次要做）

- 用户端：获取当前可用问卷、渲染题目、提交答卷、查看/触发重新填写
- 后端：答卷存储、答卷覆盖策略（只保留最新有效答卷）、匹配计算与结果输出

### 2.2 非范围（暂不做/后续再做）

- 复杂的运营策略（曝光分配、冷启动扶持、反作弊等）
- 强社交链（双向同意、聊天、拉黑等）
- 复杂 NLP 解析（大量开放题内容理解）

## 3. 现状与依赖

- 后端已有问卷配置表（管理端维护/导入导出/预览）：
  - `questionnaire`（问卷）
  - `questionnaire_question`（题目配置，含 weight/题型/选项等）
  - 见 [questionnaire.sql](file:///c:/Users/MrLee/Desktop/%E7%BD%97%E5%BE%B7%E4%B9%8B%E9%97%A8/%E7%A8%8B%E5%BA%8F/dateOrFriends/server/src/main/resources/sql/modules/admin/questionnaire.sql)
- 前端已有用户端匹配页面入口，但目前是占位：
  - [user/match/index.vue](file:///c:/Users/MrLee/Desktop/%E7%BD%97%E5%BE%B7%E4%B9%8B%E9%97%A8/%E7%A8%8B%E5%BA%8F/arkMatchWeb/src/views/user/match/index.vue)
  - 路由： [router/modules/match.ts](file:///c:/Users/MrLee/Desktop/%E7%BD%97%E5%BE%B7%E4%B9%8B%E9%97%A8/%E7%A8%8B%E5%BA%8F/arkMatchWeb/src/router/modules/match.ts)

## 4. 用户流程（User Flow）

### 4.1 初次进入

1. 用户进入“匹配/问卷”页面
2. 系统拉取“当前可填写的问卷”（状态为 READY，且未删除）
3. 若用户无有效答卷：展示问卷填写表单
4. 用户提交后：进入匹配结果展示（或显示“已提交，正在生成匹配”并展示推荐列表）

当前可填写问卷选择规则（MVP）：

- 当存在多份 `status=READY && deleted=0` 的问卷时，取 `updated_at` 最大的一份；若 `updated_at` 相同则取 `id` 最大的一份
- 同时提供“选择问卷”入口：当存在多份 READY 问卷时，用户可以在弹窗中选择要填写/查看匹配的问卷

### 4.2 再次进入

- 若用户已有有效答卷：默认展示
  - 答卷摘要（可选）
  - 推荐列表（匹配结果）
  - “重新填写问卷”入口

### 4.3 重新填写（覆盖旧答卷）

1. 用户点击“重新填写问卷”
2. 页面内弹窗确认（在当前组件内部完成，避免系统级弹窗）
3. 确认后进入填写状态
4. 新提交成功后：旧答卷作废，仅保留最新有效答卷并据此重新匹配

## 5. 用户端页面要求

### 5.1 题型支持（MVP）

- 单选：`question_type = 单选`
- 多选：`question_type = 多选_X`（X 为 >= 2 的正整数，表示最多可选数量）
- 判断：`question_type = 判断`
- 填空：`question_type = 填空`

说明：后端问卷题型当前按中文字符串存储，并且多选题型携带最大可选数量（`多选_3`）。用户端需要解析 `X` 并在 UI 层做“最多选择 X 个”的限制，同时后端提交时也需要二次校验。

答案编码约定（MVP）：

- 判断题提交与存储：`answer_text` 固定为 `true` / `false`（小写）
- 多选题提交与存储：`answer_text` 用英文半角 `|` 分隔选项值（例如 `A|C|D`），且去重后按选项在题目 `options_text` 中出现的顺序排序
- 单选题提交与存储：`answer_text` 为选项值本身
- 填空题提交与存储：`answer_text` 为原文本（建议 trim；最大长度与入库校验保持一致）

### 5.2 表单交互

- 题目按 `seq` 正序渲染；子问题按 `parent_seq` 归属渲染
- 子问题触发规则：
  - 当父问题选项命中 `trigger_option` 时显示
  - 未命中时隐藏，并且不提交该子问题答案
- 校验策略（MVP）：
  - 主问题默认必填（除非未来加字段明确非必填）
  - 子问题仅在显示时必填

### 5.3 提交后展示

- 最少展示两块：
  - “匹配推荐列表”（卡片/列表）
  - “重新填写问卷”按钮

## 6. 数据库设计（答卷存储）

### 6.1 设计目标

- 每个用户只允许存在 1 份“有效答卷”
- 重新填写时旧答卷作废，避免历史数据影响匹配
- 保留历史答卷为可选项（用于审计/分析），但对外逻辑只认最新有效

### 6.2 建议表结构（新增）

#### `user_questionnaire_answer`（答卷主表）

- `id` BIGINT PK
- `user_id` BIGINT NOT NULL（对应 user.id）
- `questionnaire_id` BIGINT NOT NULL（对应 questionnaire.id）
- `status` ENUM('ACTIVE','DISCARDED') NOT NULL
- `active_flag` TINYINT NULL COMMENT '仅 ACTIVE 置 1；DISCARDED 置 NULL（用于唯一约束）'
- `submitted_at` DATETIME NOT NULL
- `created_at` / `updated_at`

约束建议：
- `UNIQUE (user_id, active_flag)`：仅允许存在 1 条 `active_flag=1` 的记录；DISCARDED 为 NULL 时可保留多条历史

建表 SQL（MVP 建议，供直接落地）：

```sql
CREATE TABLE `user_questionnaire_answer` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `questionnaire_id` BIGINT NOT NULL,
  `status` ENUM('ACTIVE','DISCARDED') NOT NULL,
  `active_flag` TINYINT NULL,
  `submitted_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_active` (`user_id`, `active_flag`),
  KEY `idx_user_questionnaire` (`user_id`, `questionnaire_id`),
  KEY `idx_questionnaire_status` (`questionnaire_id`, `status`),
  CONSTRAINT `fk_uqa_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_uqa_questionnaire` FOREIGN KEY (`questionnaire_id`) REFERENCES `questionnaire` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

#### `user_questionnaire_answer_item`（答卷明细）

- `id` BIGINT PK
- `answer_id` BIGINT NOT NULL（FK -> user_questionnaire_answer.id）
- `question_seq` INT NOT NULL（对应 questionnaire_question.seq）
- `parent_seq` INT NOT NULL（与 questionnaire_question.parent_seq 对齐，用于区分子题）
- `answer_text` VARCHAR(1024) NOT NULL（单选/判断存选项值；多选存 `|` 分隔；填空存文本）
- `created_at`

约束建议：
- `UNIQUE (answer_id, parent_seq, question_seq)`

建表 SQL（MVP 建议，供直接落地）：

```sql
CREATE TABLE `user_questionnaire_answer_item` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `answer_id` BIGINT NOT NULL,
  `question_seq` INT NOT NULL,
  `parent_seq` INT NOT NULL DEFAULT 0,
  `answer_text` VARCHAR(1024) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_answer_question` (`answer_id`, `parent_seq`, `question_seq`),
  KEY `idx_answer_id` (`answer_id`),
  CONSTRAINT `fk_uqai_answer` FOREIGN KEY (`answer_id`) REFERENCES `user_questionnaire_answer` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 6.3 覆盖策略（“重新填写舍弃旧答案”）

提交新答卷时的事务语义：

1. 将用户当前 ACTIVE 答卷更新为 DISCARDED
2. 新增一条 ACTIVE 答卷主表记录
3. 批量插入答卷明细

对外读取时：
- 永远只读取 `status = ACTIVE` 的那一份

## 7. 接口契约（建议）

> 现有后端 OpenAPI 约定：统一返回结构 `{ code, message, data }`，并使用 Bearer Token（bearerAuth）。以下为用户端新增接口的最小闭环集合，路径风格与现有 `/user/*` 对齐。

### 7.1 获取当前可填写问卷

- `GET /user/questionnaire/current`
- 返回：
  - questionnaire：id/title/subtitle
  - questions：seq/parentSeq/questionText/questionType/optionsText/triggerOption/weight
  - state（用于用户端页面状态机，避免多次请求）：
    - `hasActiveAnswer`: boolean（是否已有 ACTIVE 答卷）
    - `activeAnswerQuestionnaireId`: number|null（ACTIVE 答卷对应问卷 id）
    - `needReSubmit`: boolean（ACTIVE 答卷存在但不属于当前问卷时为 true）
    - `activeSubmittedAt`: string|null（ACTIVE 答卷提交时间）

### 7.1.1 获取可选问卷列表（READY）

- `GET /user/questionnaire/ready-list`
- query：`page` / `size`
- 返回：[{ id, title, subtitle, updatedAt }]

### 7.1.2 获取指定问卷详情（READY）

- `GET /user/questionnaire/{id}`
- 返回结构同 `/user/questionnaire/current`（meta + questions + state）

### 7.2 获取我的有效答卷（可选）

- `GET /user/questionnaire/my-active`
- 返回：answer + items（用于“已填写”状态的摘要展示）

### 7.3 提交答卷（覆盖旧答卷）

- `POST /user/questionnaire/submit`
- body：
  - `questionnaireId`
  - `answers`: [{ parentSeq, seq, answerText }]
- 行为：覆盖旧答卷，仅保留最新 ACTIVE

### 7.4 获取匹配推荐列表

- `GET /user/match/recommendations`
- query（可选）：`limit` / `offset`
- 返回：[{ userId, nickname, avatarUrl, region, age, tags, score, highlights }]

## 8. 匹配逻辑（MVP 规则）

### 8.1 输入数据

- 当前用户 ACTIVE 答卷
- 候选用户集合（MVP 最小过滤）：
  - 排除自己
  - 排除封禁/暂停用户
  - 必须存在 ACTIVE 答卷且与“当前用户答卷”属于同一份问卷（同 questionnaire_id）

### 8.2 分数计算（建议的最小可用算法）

对每一道题计算相似度，再按权重汇总：

`finalScore = Σ (weight_i * similarity_i)`

相似度定义（MVP）：

- 单选/判断：
  - 相同：1
  - 不同：0
- 多选：
  - `similarity = |A ∩ B| / |A ∪ B|`（Jaccard）
- 填空：
  - MVP 可先不纳入得分（similarity=0 或跳过并重新归一化），后续再加规则化/枚举化/文本相似

权重来源：
- 使用 `questionnaire_question.weight`
- 若存在跳过项（例如填空不计分），建议对参与计算的权重做归一化，避免总分偏低

分数范围（MVP）：

- 对外输出 `score` 为 `0 ~ 100` 的数值
- 若存在跳过题目：仅对参与计算的题目做权重归一化，使最终满分仍为 100

### 8.3 输出与排序

- 按 `finalScore` 倒序
- 返回 TopN（默认 20）
- 可附带 `highlights`：
  - 例如“你们在 Q3/Q7 选择一致”“兴趣重合度 60%”

## 9. 边界与异常处理

- 当前没有 READY 问卷：用户端显示空态（提示管理员发布问卷）
- 问卷更新（questionnaire_id 变化）：
  - 用户已有 ACTIVE 答卷但属于旧问卷：建议提示用户“问卷已更新，请重新填写”，并引导覆盖提交
- 子问题隐藏：不允许提交对应答案；后端需校验避免脏数据
- 重复提交：以最后一次提交为准（覆盖旧答卷）

并发/重复点击（MVP）：

- 提交接口用事务保证“旧 ACTIVE 作废 + 新 ACTIVE 写入 + 明细写入”原子性
- 利用 `UNIQUE (user_id, active_flag)` 防止出现两个 ACTIVE；并发冲突时可重试一次或返回“请稍后重试”

## 9.1 后端校验（MVP 必做）

- 问卷状态校验：仅允许提交 `status=READY && deleted=0` 的问卷
- 题目合法性校验：每个提交项必须能在 `questionnaire_question` 中找到对应 `(questionnaire_id, parent_seq, seq)`
- 子题触发校验：子题仅在父题答案命中 `trigger_option` 时允许提交
- 多选上限校验：`question_type=多选_X` 时，提交答案拆分后数量必须 `<= X`

## 10. 里程碑拆分（建议）

- M1：后端补齐答卷表 + 提交/查询接口（仅存储，不做匹配）
- M2：用户端问卷渲染 + 提交流程打通
- M3：后端匹配计算 + 用户端推荐列表展示
