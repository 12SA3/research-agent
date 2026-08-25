---
title: Agent 辅助数字孪生 3D 前端的架构与工作流落地方案
status: draft
created: 2026-08-21
updated: 2026-08-21
author: Codex
tags: [agent, digital-twin, thingjs, workflow]
---

# Agent 辅助数字孪生 3D 前端的架构与工作流落地方案

## 1. 目标与原则

方案面向当前 Vue 3 + TypeScript + ThingJS 2.0 校园项目，目标是把 Agent 嵌入可审计的软件交付链。Agent 负责检索、起草、执行和收集证据；开发者负责业务边界、空间语义、体验取舍与高风险审批。每次变更都应回答：需求依据是什么，调用了哪个已验证 API，创建了哪些三维对象和事件，何时销毁，如何证明没有破坏其他层级。

建议坚持五条原则：规格先于代码；项目事实先于模型常识；确定性工作流先于自由自治；真实环境反馈先于文字自评；最小权限和可撤销先于效率。Anthropic 对 Agent 与 workflow 的区分具有参考价值：固定、可预测的任务用编排好的工作流，只有子任务无法预先确定且能从环境持续获得真实反馈时才使用自主 Agent。对本项目，多数接口适配、Marker 开发和业务注册都属于 workflow，不需要复杂多 Agent。

## 2. 建立单一事实源

第一步不是换模型，而是整理 Agent 可以信任的知识层。建议在 `openspec/` 维护长期能力规格，在 `openspec/designs/` 保存单次设计，在 `public/docs/` 维护接口契约，在一个明确目录维护 ThingJS 2.0 项目能力卡。README 只做入口，不再重复描述会漂移的架构细节。

能力卡按任务拆分，而非整本 SDK 投喂。至少包含：场景初始化与销毁；Campus/Building/Floor/Room 层级；对象查询与选择器；世界/局部坐标；HTMLMarker 与 Vue DOM；Box、PixelLine、RouteLine；相机；模型加载和动画；业务数据与对象 UUID 映射；事件 `on/off` 形式。每张卡要标注“ThingJS API”“项目自定义逻辑”“已知版本差异”“最小可运行示例”和“清理动作”。Agent 找不到证据时必须停在设计或检索阶段，不得臆造 API。

当前 README 声称主线是 `BaseStory/src/stories`，真实代码则使用 `BusinessInitManager`、`BaseBusinessLogic`、`registry` 和业务 Manager。应立即修正为单一架构图，并给旧模式加 deprecated 标记。能源管理中整段注释旧实现也应迁移到设计记录或删除，避免检索把废弃代码当成推荐样例。全局 `window.*Ins` 暂时可保留为集成边界，但应列出所有者、创建时机和清理时机。

## 3. 推荐的 Agent 工具边界

只读工具默认开放：代码搜索、文件读取、Git 差异、类型信息、接口文档、构建日志、浏览器 DOM、场景对象统计和截图。写工具按风险分级：修改工作区文件可自动但必须限制在任务目录；安装依赖、修改构建配置和批量重命名需审批；访问生产接口、发布、发送消息和物理控制默认禁止。任何来自网页、接口字段或模型资源的文本均视为不可信数据，不能改变 Agent 的系统指令或权限。

为 ThingJS 再封装少量只读诊断工具会比继续堆提示词更有效，例如：`getCurrentLevel()` 返回标准化层级；`listSceneObjects(selector)` 返回数量、父级和可见性；`countOwnedResources(ownerId)` 返回 Marker、Box、线和监听；`captureCameraState()` 只读公开相机字段；`waitSceneStable()` 等待加载、连续帧和业务切换完成。这些工具输出结构化 JSON，避免 Agent 依赖控制台长文本和私有字段。

写入型场景工具只用于测试沙箱，如 `changeLevel(target)`、`activateBusiness(name)`、`selectSubMenu(id)`、`cancelRoaming()`。工具内部实现超时、取消和回滚，Agent 不直接拼接任意脚本操作 `window.app`。产品运行时 Agent 若要聚焦建筑，也应调用受限的“聚焦对象”工具，而不是获得完整 ThingJS 实例。

## 4. 标准交付流程

阶段一是探索。Agent 读取需求、当前层级和业务注册，搜索相似功能，形成“已知、未知、假设、风险”四栏摘要。涉及 SDK 时按能力卡、项目示例、官方 API 的顺序核对；涉及接口时先定位 `public/docs` 与 Mock。此阶段不改代码。

阶段二是提案。输出可测试验收条件，例如：“在 Floor 层仅显示该楼层设备 Marker；离开 Floor 后对象数恢复基线；重复进入五次不增加监听；接口失败显示空态且无未处理异常”。设计同时列明 parent、坐标系、对象所有者、事件 tag、异步取消点和清理顺序。若需求只说“在三维中显示”，Agent 必须把空间归属和生命周期补成明确问题或采用已有约定。

阶段三是实施。优先改最少文件：Vue 负责视图和事件派发，业务 Manager 负责编排，ThingJS service 或控制器负责对象创建与销毁，API 层负责数据。不要把 ThingJS 复杂对象深度放进 Vue `reactive/ref`；如需在 UI 保存外部实例，只使用普通变量、`markRaw` 或经过验证的浅层引用。不要越过 ThingJS 直接写 Three.js/WebGL，除非已有明确授权和兼容方案。

阶段四是验证。依次运行类型检查和构建、单元或契约测试、真实场景交互、视觉快照、性能与资源检查。验证顺序至少覆盖首次进入、层级切换、重复进入、业务快速切换、接口失败、模型加载失败、取消和页面卸载。Agent 必须展示命令、结果、截图或计数，不得用“代码看起来正确”代替证据。

阶段五是交付。同步接口文档、Mock、变更日志和设计决策，生成面向评审者的短摘要：修改文件、行为变化、未覆盖风险、人工验收步骤。若 Agent 只完成部分任务，必须保留未完成状态，不得把“测试未运行”包装成通过。

## 5. 适用于本项目的任务模板

新增 3D 分布功能可固定为：定义业务数据类型；补接口文档与 Mock；实现只读数据方法；建立 Manager；在 Campus/Building/Floor 映射函数中确定所属层级；按对象 UUID 或明确规则创建 Entity/Marker；注册带 tag 的交互；实现 `enter/leave/destroy`；注册业务或子菜单；补资源计数、截图和错误用例。模板的关键不是文件数量，而是强制写出 parent、坐标和清理。

修复视觉问题可固定为：获取基准截图、相机状态和环境信息；限定问题区域；定位 DOM、ThingJS 对象或材质；提出不超过三个假设；每次只改变一个因素；等待场景稳定后复拍；比较像素差与业务语义；恢复无效尝试。SWE-bench Multimodal 的结果说明视觉问题不能只靠文本，工具必须支持区域截图和从截图回到对象或组件的定位。

## 6. 组织与评审机制

建议设三种角色。业务负责人确认“现实对象和决策价值”；3D 负责人确认层级、坐标、视觉和性能；Agent 维护者确认上下文、权限、评测与成本。普通变更一人评审，高风险变更至少业务和 3D 双签。生产数据、人员信息和控制接口不得进入无授权的外部模型上下文。

Agent 的评价指标不要只看接受代码行数。应统计首次构建通过率、验收用例通过率、人工返工分钟、线上回滚、资源泄漏、文档同步率和单位成功任务成本。DORA 2025 把 AI 视为放大组织能力的因素，因此试点前应先补规格和测试；METR 的研究则提示主观“感觉更快”可能与实际耗时相反，应以同类任务对照测量。

## 7. 分阶段落地

第一阶段只做检索、文档、规则审计和测试生成；第二阶段开放接口适配、常规 Marker 和 Vue 组件修改；第三阶段在沙箱中允许跨文件业务功能；第四阶段才评估只读运行时副驾驶。每阶段达标条件均为可量化质量不下降，而非调用次数增长。

最终架构应是“确定性数字孪生底座 + 受限工具 + 可追踪 Agent + 自动评测 + 人类审批”。Agent 不替代场景状态机和规则引擎，也不成为新的全局单例；它通过稳定接口调用这些系统。这样才能在模型快速变化时保留工程可控性，并让项目积累的 ThingJS、业务和现场知识持续复用。

## 参考资料

- [Anthropic：Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [DORA：State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)
- [METR：开发者生产率随机试验](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [SWE-bench Multimodal](https://arxiv.org/abs/2410.03859)
- [Vue：shallowRef 与外部状态](https://vuejs.org/api/reactivity-advanced.html)
- [MDN：WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
