# AxioDraw 交接文档

最后更新：2026-11-14  
当前版本：**1.9.1**  
仓库：<https://github.com/dyarc/opencalque>  
网页：<https://dyarc.github.io/opencalque/>  
安装包：<https://github.com/dyarc/opencalque/releases/tag/v1.9.1>

这份文档写给下一个接手的人或 AI。用户是室内设计师，不写代码：沟通要用中文、大白话，不要用未解释的术语。

---

## 1. 项目是什么

AxioDraw 是 OpenCalque 的二次开发版本：

- 2D 建筑/室内绘图
- Electron 桌面端（macOS / Windows / Linux）
- 同一套 React + Vite 代码也能作为静态网页运行
- 图纸是纯 JSON，扩展名 `.adg`
- 内部格式名仍叫 `opencalque`，旧的 `.opencalque` / `.opencad` 文件仍可打开

上游项目：<https://github.com/laurent512/opencalque>  
当前仓库的 `main` 已经是 AxioDraw 版本；原来的 v1.7.0 保存在分支 `legacy-v1.7.0`。

---

## 2. 技术栈与目录

pnpm monorepo：

```text
packages/core       模型、几何、渲染 primitive、偏移、立面、轴测
apps/web            React + Vite 编辑器（桌面端也复用它）
apps/desktop        Electron 主进程和打包
apps/desktop/scripts  afterPack、图标、体积精简脚本
fonts               PDF 用的 Noto 字体（原 TTF + 打包用 .ttf.gz）
.github/workflows   Pages 与 Release 自动构建
```

常用命令：

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build:web
pnpm dev:web
pnpm dist            # 当前系统安装包；GitHub Release 会分别跑三系统
```

macOS 本地如果 `pnpm` 自带的 Node 出问题，可用工作区的独立 Node：

```text
/Users/boldarch/Documents/deepseek-harness/default-workspace/.tools/node/bin/node
/Users/boldarch/Documents/deepseek-harness/default-workspace/.tools/bin/pnpm
```

Windows 上正常安装 Node 22 LTS + pnpm 9 即可。

---

## 3. 已完成的主要功能

- 触摸板双指平移、捏合缩放，滚轮/触摸板偏好
- 构造线（无限虚线、偏移、交叉框选）
- 圆角：多段线内部真弧、跨对象圆角、弧形墙
- 炸开 / 合并，合并支持圆弧
- 半径 / 角度尺寸，属性完整
- 格式刷
- 3D 轴测视图（Shift+3）
- 板、柱、梁、矩形挖洞、下沉箱
- 立面/剖面的剖切填充与线宽
- AutoCAD 式命令词：1–3 个字母 + 空格
- 椭圆三点画法：两个轴端点 + 第三点定另一方向宽度；第一点后有吸附色虚线辅助线
- 椭圆/圆弧偏移；带弧多段线整体偏移（副本采样为平行折线）
- AD 字母标：应用图标、菜单、欢迎页、favicon、文件名图标
- 启动画面：黑底，先出现放大的 AD 标，再渐入 `AxioDraw - Present Your Taste.`，总时长 2.8 秒
- 绘图区左上角显示文件名与保存状态
- 顶部 `AxioDraw` 文字本身打开原来的“文件”菜单，单独的“文件”按钮和 Logo 已移除
- 框选偏好：拖拽式（默认）或 AutoCAD 点击式（点击、移动、再点击）
- 体积精简：删掉 Electron 多余语言（约 42 MB）、PDF 字体 gzip（约 12 MB）

---

## 4. 最近改动的关键文件

| 功能 | 文件 |
|---|---|
| 启动画面 HTML/CSS | `apps/web/index.html` |
| 启动画面至少 2.8 秒 | `apps/web/src/splash.ts` |
| 顶部 AxioDraw / 文件菜单 | `apps/web/src/MenuBar.tsx` |
| 文件名移到画布左上 | `apps/web/src/Stage.tsx`、`apps/web/src/styles.css` |
| 框选偏好 | `apps/web/src/prefs.ts`、`apps/web/src/Preferences.tsx` |
| AutoCAD 点击框选 | `apps/web/src/canvas/gestures/select.ts`、`canvas/gesture.ts`、`gestures/index.ts` |
| 椭圆三点 | `apps/web/src/canvas/gestures/ellipse.ts` |
| 椭圆/弧偏移 | `packages/core/src/kinds.ts` |
| 带弧多段线偏移 | `packages/core/src/kinds.ts` 的 polyline `parallel` |
| macOS 每个 `.adg` 的 Finder 图标 | `apps/desktop/src/main/index.ts`、`apps/desktop/build/adg-icon.rsrc` |
| 精简 Electron 语言 | `apps/desktop/scripts/prune-app.cjs`、`after-pack.cjs` |
| PDF 字体 gzip | `fonts/*.ttf.gz`、`apps/web/src/pdfFonts.ts`、两个 Vite 配置、`vitest.config.ts` |
| Pages 自动部署 | `.github/workflows/pages.yml` |
| 三系统安装包 | `.github/workflows/release.yml` |

---

## 5. 发布方式

### 网页

推 `main` 后，`.github/workflows/pages.yml` 自动构建并部署：

<https://dyarc.github.io/opencalque/>

### 安装包

GitHub Actions 的 `release.yml` 由 `v*` 标签触发：

1. 修改版本号和 `CHANGELOG.md`
2. 提交并推 `main`
3. 打标签并推送，例如：

```sh
git tag v1.9.2
git push origin v1.9.2
```

GitHub 会同时在 macOS、Windows、Ubuntu 机器上构建：

- `.dmg`（Apple Silicon + Intel）
- Windows setup `.exe`
- Windows portable `.exe`
- Linux `.AppImage`
- 自动创建 Release

当前 v1.9.1 已经成功构建了三系统安装包。

> 工作流文件里的 Release 标题已经改成 `AxioDraw`。

---

## 6. 验证状态

最近一次完整验证：

- `pnpm typecheck` 通过
- `pnpm test`：90 个测试文件 / 867 个测试全通过
- `pnpm build:web` 通过
- GitHub Release v1.9.1 的 macOS / Windows / Linux 构建全部成功
- 网页 <https://dyarc.github.io/opencalque/> 返回 200

注意：测试数量会随着新功能变化，以实际命令结果为准。

---

## 7. 已知限制与坑

1. **macOS 文件图标**
   - 文件类型图标在 ad-hoc 签名下会被 LaunchServices 标成 untrusted
   - 现在改为保存/打开 `.adg` 时往文件自己的资源叉写入图标
   - 旧文件需要打开一次才会补图标
   - 新保存的文件自动带图标

2. **macOS 钥匙串**
   - 启动时不再主动询问 Safe Storage
   - 只有真正读取/保存 API Key 时才访问
   - 如果已经保存过 Key，ad-hoc 签名变化后仍可能再问一次
   - 彻底解决需要固定本地签名证书，目前没做

3. **安装包未签名/未公证**
   - macOS 首次打开要右键 → 打开
   - Windows SmartScreen 可能提示未知发布者

4. **立面/剖面仍是近似**
   - 复杂/旋转实体的剖切用遮罩式前面，不是严格的 3D 布尔剖切
   - 弧形墙立面按正投影宽度显示，不是展开图

5. **带弧多段线偏移**
   - 结果会沿弧采样成平行折线，不再保留 bulge 真弧
   - 如果以后要求偏移后仍是真圆弧，需要逐段重算圆心和连接点

6. **Windows 文件图标**
   - 已提供 `build/icon.ico` 和 `win.icon`
   - 但还没有在真实 Windows 机器上人工检查文件关联图标

7. **静态网页**
   - 桌面专属功能（本地文件、钥匙串、自动更新）在网页版不可用
   - 网页版适合预览/轻量使用，不是完整桌面替代

---

## 8. Windows 上继续开发

```powershell
git clone https://github.com/dyarc/opencalque.git
cd opencalque
pnpm install
pnpm dev:web
```

需要：

- Git for Windows
- Node.js 22 LTS
- pnpm 9

本地跑桌面端：

```powershell
pnpm dev
```

如果只想用安装包，不需要在 Windows 本地构建，直接下载 Release 里的 `.exe`。

---

## 9. 给下一位 AI 的提醒

- 先读本文件、`AGENTS.md`、`docs/ARCHITECTURE.md`、`CHANGELOG.md`
- 用户看不懂代码，不要贴大段实现；用中文解释“会看到什么效果”
- 改动前先跑基线测试，改完至少跑：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build:web`
- 不要提交 `release/`、`node_modules/`、`.github-token`
- GitHub Token 只在本地临时使用，用完删除并让用户撤销
- 不要 force push `main`，除非用户明确要求；旧版本已经保存在 `legacy-v1.7.0`
- 新功能优先加测试；i18n 新增 key 要同时补 de/es/fr/ja/ko/tr/zh
- 图纸格式变更必须遵守 `docs/ARCHITECTURE.md` 的迁移规则

---

## 10. 当前未完成/可继续的方向

- 真正的 3D 剖切布尔（现在复杂实体仍是遮罩近似）
- 弧形墙立面展开
- 带弧多段线偏移后保持真弧
- 门窗、家具进入 3D 轴测
- Windows 上的人工验收
- 固定本地签名证书，解决钥匙串“每次新版本再问一次”
- 将 PDF 字体改为按需下载，进一步减小安装包

---

如果要继续，最稳妥的方式是先把本文件读完，再在 Windows 上跑一遍 `pnpm test`，确认当前基线，再开始改。
