# PCCleaner

PCCleaner 是一款基于 Electron + React + TypeScript 的跨平台系统清理与网络诊断工具。

## 功能范围

- 磁盘清理:系统盘重点扫描、建议删除等级、默认勾选规则、回收站/备份安全策略。
- 文件说明:本地中文知识库优先,未命中时提供一键在线查询。
- 注册表清理:仅 Windows 启用,清理前导出备份,Mac 优雅降级。
- 重复文件:大小分组、哈希确认、重复组标记。
- 网络诊断:链路层、网络层、DNS、传输层、应用层和外部因素的专家式排障框架。
- 磁盘占用:卷容量和目录树扫描接口,支持可释放空间估算。
- 开机启动:Windows 与 macOS 启动来源抽象,支持一键关闭入口。
- 桌面广告检测:启发式可疑来源扫描,提供结束进程、禁用启动项和隔离入口。
- 用户提示:全局加载指示器、Toast、风险说明、二次确认和撤销接口。

## 开发命令

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

## 目录结构

```text
src/main/              Electron 主进程、IPC、平台能力和服务层
src/preload/           contextBridge 安全 API
src/renderer/src/      React 页面、组件、状态、主题和国际化
shared/types/          主进程与渲染进程共享类型
```

## 安全注意事项

所有危险操作都应遵循“预览 -> 二次确认 -> 备份 -> 执行 -> 可撤销/还原”的流程。后续实现注册表、服务、Winsock、启动项和文件隔离时,必须先完善白名单、权限校验、失败回滚和用户可理解的中文提示。
