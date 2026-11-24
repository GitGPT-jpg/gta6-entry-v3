# Porto Verde — 开放世界犯罪故事

[![Porto Verde](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Porto Verde** 是一座虚构的港口城市开放世界犯罪游戏：步行、开车、抢车、通缉、故事任务、隐藏收集，全部离线运行，零网络请求。

## 玩法

- **主角 Marco Reyes**：码头工人出身的亡命徒，为中间人 Rosa Delgado 接活，对抗帮派 Los Tiburones。
- **6 个故事任务**：第一单、偷车、鲨鱼饵、码头交易、报复、大买卖——取货、偷跑车、抢公文包、码头枪战、打爆三辆面包车、抢劫港口仓库。
- **开放世界**：2600×2000 的港口城市，市中心、居民区、工业区、码头、沙滩、夜市、公园；交通车流、行人、昼夜循环。
- **通缉系统**：0–5 星，警车追捕、步行警察抓捕、被捕/死亡后在警局/医院重生；去 Rosa 的车库喷漆（$100）可消星修车。
- **隐藏收集**：10 个金锚（⚓）散落在全城，集齐奖励 $1,000。
- **存档**：localStorage 自动保存进度、位置、金钱和任务。

## 操作

| 按键 | 动作 |
| --- | --- |
| WASD / 方向键 | 步行 / 开车 |
| E | 上车 / 下车（靠近车辆时抢车） |
| 鼠标左键 | 射击（步行时） |
| F | 拳击 |
| Shift | 疾跑 |
| 空格 | 手刹 |
| T | 接下一个任务 |
| P | 暂停 |

## 运行

直接用桌面 Chrome 打开 `game/index.html` 即可玩，无需构建、不用联网。

```sh
# 本地预览（可选）
node serve.ts   # 然后打开 http://localhost:8080
```

## 技术

- 纯 Canvas 2D + ES 模块，零第三方库，零网络请求。
- 12 个 JS 模块：`util`、`city`、`audio`、`core`、`vehicles`、`people`、`cops`、`weapons`、`story`、`paint`、`screen`、`boot`。
- 音效全部由 WebAudio 合成，无音频文件。
- `main.ts`（Node 22，仅标准库）把 `game/` 和 `screenshots/` 复制到 `/output`，并用 `vendor/makefun-game.ts` 的 `buildDossier` 写出 `dossier.json`。

## 截图

`screenshots/` 下 4 张 1280×800 实机截图：封面（市中心飙车）、码头步行、任务追捕（黄昏）、夜景。
