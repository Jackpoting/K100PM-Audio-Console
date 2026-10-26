# REDMI K100 PRO MAX 音质控制台 · 1.0（内置 WebUI）

> Dolby DAX3 全链路调音模块 · 内置可视化调音台 · 默认调音 = **K100PM 调整版**

作者：蓝鲸鱼🐳　版本：1.0

---

## 1. 版本说明

**1.0 是品牌与版本重置版**：模块更名为 **REDMI K100 PRO MAX 音质控制台**，作者 **蓝鲸鱼🐳**；保留 v1.5D 的 20 段恢复、OTG 默认关闭与全部性能优化，并将增益范围提升到 **±20 dB**。安装脚本新增机型校验，设备不匹配直接终止，**不会修改任何文件**。

| 项目 | 1.0 |
| --- | --- |
| 名称 / 作者 | REDMI K100 PRO MAX 音质控制台 / 蓝鲸鱼🐳 |
| 增益范围 | ±20 dB，20 段，滑杆步进 0.05 dB |
| 机型校验 | songyuan + M098FE/K100 + Android 15+ + Dolby 配置 + 安装包 MD5；不匹配 abort |
| 20 段恢复 | 继承 v1.5D：按 IEQ1 实际曲线恢复，支持「恢复」与自愈重建 |
| OTG | 继承 v1.5D：默认关闭，可手动开启常开守护 |
| 性能 | 继承 v1.4D+：首屏 0.2–0.3 s，apply 0.39 s |

### 1.1 历史版本对照（v1.3A – v1.5C）

| 项目 | v1.3A | v1.4C | v1.4D | **v1.5C** |
| --- | --- | --- | --- | --- |
| 调音配置 | 模块内置 3 条 IEQ + 7 条 GEQ 曲线 | **10 个槽位全部写入 K100PM 调整版（默认配置）** | 同 v1.4C | 同 v1.4D |
| 管理方式 | 只能改文件 / 重刷模块 | **内置 WebUI 调音台**，可视化编辑、保存、导入导出 | 同 v1.4C | 同 v1.4D |
| 运行时属性 | 写死在 `service.sh` | 由 `data/props.conf` 驱动，WebUI 可热改 | 同 v1.4C | 同 v1.4D |
| 曲线库 | 无 | 13 条内置（默认 / 参考 / 平直 / 原厂 ×10）+ 自定义曲线 | 同 v1.4C | 同 v1.4D |
| 校验 | 安装时 MD5 | 安装时 MD5 + WebUI 完整性自检 + 出厂备份 | 同 v1.4C | 同 v1.4D |
| 性能 | — | 首屏 5.2–7.3 s，操作有明显停顿 | **首屏 0.2–0.3 s，交互顺滑（详见 2.1）** | 同 v1.4D |
| OTG | — | 系统 10 分钟无操作自动关闭 | — | **开机自动开启 + 守护防超时（详见 2.2）** |

### 1.2 v1.5D 变更（1.0 继承）

- **OTG 默认改为关闭**：`data/otg.conf` 出厂值为 `AUTO_ON=0`、`KEEP_ON=0`，需要在 OTG 页或配置里手动开启；从 v1.5C 升级时，如果旧配置仍是 v1.5C 的出厂默认（1/1/30），会自动切到新默认，自定义过的配置则保留。
- **20 段增益恢复**：
  - 打开页面时优先按当前槽位（IEQ1）实际使用的曲线恢复 20 段数值，不再被 `k100pm_tuned` 覆盖；
  - 「20 段增益」卡片新增 **「恢复」** 按钮，一键回到当前曲线的 20 段值；
  - 增益区增加自愈重建：行缺失、数量不符或被移出 DOM 时自动重建，任何情况下都保持 20 段；
  - 这些改动不增加 shell 调用，首屏仍只发 1 次 `snapshot`，性能与 v1.4D 一致。

---

## 2. 打开 WebUI

| Root 管理器 | 入口 |
| --- | --- |
| KernelSU / SukiSU Ultra | 模块列表 → REDMI K100 PRO MAX 音质控制台 → **打开**（WebUI 按钮） |
| APatch | 模块详情 → WebUI |
| MMRL / WebUI X | 模块详情 → WebUI |

WebUI 由模块自带的 `webroot/index.html` 加载，**完全离线**，不请求任何网络资源。页面中的特权操作通过 KernelSU 的 `ksu.exec` 调用模块自带 CLI：

```
/data/adb/modules/k100pm_audio_plus/bin/k100pm.sh
```

> 用浏览器直接打开 `webroot/index.html` 会进入「预览模式」：界面、交互、演示数据完整，但不会写入设备。

### 2.1 性能优化（v1.4D）

真机（REDMI K100 Pro Max / Android 15）实测，同一份配置、同一台设备：

| 操作 | v1.4C | v1.4D | 提升 |
| --- | --- | --- | --- |
| 打开 WebUI（首次 `snapshot`） | 5.2–7.3 s | **0.17–0.28 s** | ≈ 30× |
| 写入配置 `apply` | 14.5 s | **0.39 s** | ≈ 37× |
| 刷新状态 / 曲线库 / 属性 | 1.3–2.2 s | **0.05–0.08 s** | 20×+ |
| 写入 10 个槽位 | 最多 10 次 shell 调用 | **1 次**（`assign-map`） | ≤ 10× |
| 保存多项 DAX 属性 | 每项 1 次 shell 调用 | **1 次**（`set-props`） | N× |

关键原因与做法：

1. **`printf` 是外部命令**：Android 的 `/system/bin/sh`（mksh）里 `read` / `case` / `echo` / `print` 是内建，而 `printf` 每次都要 fork（本机 ≈ 6–8 ms）。旧版 `snapshot` 约 600 次 fork，现在热路径全部用内建 `print -rn --` / `read`，几乎不 fork。
2. **一次 exec 拿全首屏数据**：新增 `snapshot` 命令，`status + curves + slots + props` 一次返回，WebUI 启动只发 1 次 shell 调用。
3. **`getprop` 只跑一次**：旧版每个属性一次 `getprop`（22 项 ≈ 22 次），现在一次 `getprop | grep -F` 过滤后纯 shell 解析。
4. **文件解析去管道**：曲线 20 段用 `read` 一次读入（替代 `tr`/`head`/`sed`）；`/proc/mounts` 只读一次，并用 `-ef`（同 inode）判断 bind 同源，省掉多份 137 KB 的 `md5sum`。
5. **前端骨架先行**：不等 shell 往返，先按固定 20 段计划画出可交互界面，再填充真实数据；非当前 Tab 懒渲染；曲线库/属性/状态页只在切到该页时构建。
6. **Canvas 降载**：网格与刻度预渲染到离屏画布，每帧只 `drawImage`；`devicePixelRatio` 封顶 2×；去掉昂贵的 `shadowBlur`，改用两层描边。
7. **CSS 去掉 `backdrop-filter`**：顶栏/标签栏/弹窗/应用条改为实色，滚动不再每帧重算背景模糊；阴影半径同步收敛。
8. **批量写命令**：`assign-map` 一次写完整份槽位映射，`set-props` 一次写多项属性，避免「每项一次 exec」的往返。

> 说明：以上数据来自本机 `date +%s%N` 计时与 5 次重复测量的中位区间；不同 Root 管理器/存储状态会有少量浮动，但量级一致。

### 2.2 OTG 常开（v1.5C 引入，v1.5D 默认关闭）

HyperOS 的 OTG 开关最终落在 `/sys/class/xm_power/typec/cc_toggle`（Settings 的 `OtgUtils.isChecked/setCheck` 读写该节点），原系统会在打开 10 分钟后自动关闭。模块改为直接控制：

- **默认关闭**：`AUTO_ON=0`、`KEEP_ON=0`，不写节点、不起守护进程；需要时在 OTG 页开启。
- **开机自动开启**：开启后 `service.sh` 调用 `k100pm.sh otg boot`，把节点写为 1。
- **永不超时**：`KEEP_ON=1` 时后台守护进程每 `INTERVAL` 秒读取一次节点，发现被系统 / HAL 关闭就自动重新打开（默认 30 秒）。
- **WebUI 可调**：新增「OTG」页，可一键开 / 关、开关开机自启与保持常开、调整复查间隔，并查看节点探测结果。
- **配置持久化**：`data/otg.conf`，自定义过的配置升级时自动保留。

真机节点：`/sys/class/xm_power/typec/cc_toggle`。若不同 ROM 节点名不同，可在 `data/otg.conf` 用 `NODE=/sys/...` 指定，或点 OTG 页的「诊断」查看实际节点与权限。

> 注意：OTG 开启后手机处于 USB Host 模式，连接电脑可能无法被识别为存储设备；需要连电脑时请先关闭 OTG。常开 OTG 会增加待机耗电。

---

## 3. 界面与功能

### 3.1 调音台
- **频响曲线编辑器**：20 段固定频点（47 Hz – 19.7 kHz），对数频率轴、±20 dB，可拖拽节点、双击归零、实时提示频率 / 增益。
- **20 段滑杆**：每段滑杆 + 数值输入（0.01 dB 精度），与曲线双向联动。
- **20 段恢复**：打开页面时按当前槽位（IEQ1）实际使用的曲线恢复 20 段数值；「恢复」按钮一键回到当前曲线的 20 段值；增益区带自愈重建，始终显示 20 段。
- **参考线**：叠加显示基准曲线（`K100PM 基准曲线`），便于对照调整量。
- **保存 / 应用**：编辑结果可保存为自定义曲线，或直接「应用并写入」10 个槽位。
- **槽位映射**：IEQ1–3（Dolby 内容 IEQ 目标）与 GEQ0–6（图形均衡预设）逐槽位选择曲线，可一键「全部 / 仅 IEQ / 仅 GEQ / 恢复原厂映射」。
- **未写入提示**：底部浮动条与标题脏点提示当前改动尚未落盘。

### 3.2 曲线库
- 内置 13 条曲线：`K100PM 调整版`（默认，标记 DEFAULT）、`K100PM 基准曲线`（基准，标记 BASE）、`平直参考线`、原厂 IEQ（Detailed / Balanced / Warm）、原厂 GEQ 预设 0–6。
- 每条曲线带迷你频响缩略图、最大 / 最小增益、来源标签。
- 支持**导入** 20 段曲线 JSON（`gains_q4` / `gains` / `gains_db` / `bands[].gain` 均可）、**导出** 到 `/sdcard/Download/k100pm_<id>.json`、删除自定义曲线。

### 3.3 DAX 属性
- 读取 `data/props.conf`（22 项 Dolby / 低功耗属性），按分组展示开关与数值。
- 修改后「保存并应用」→ 写回 `props.conf` + `resetprop` 立即生效。
- `ro.*` 音量阶数等属性由 `system.prop` 开机注入，不在本页修改。

### 3.4 运行状态
- 模块版本 / 机型 / Android / Root 类型 / 模块路径 / 配置哈希 / 上次写入时间。
- 配置链路：模块文件 → bind 挂载 → 系统路径（`/odm/etc/dolby/dax-default.xml`、`/vendor/etc/dolby/dax-default.xml`）。
- 完整性自检：模板、10 个槽位、三份配置哈希一致、DAX 结构（60 段 IEQ / 140 段 GEQ）、出厂备份、WebUI 资源、运行态挂载。
- 维护：重启音频服务、恢复原厂曲线、重启手机。

### 3.5 日志
- `/data/local/tmp/k100pm_audio.log`（开机阶段）+ `/data/local/tmp/k100pm_webui.log`（WebUI 操作）。
- 支持自动刷新（4 s）。

### 3.6 OTG
- 默认关闭（`AUTO_ON=0`、`KEEP_ON=0`），需要时手动开启；显示当前状态、控制节点、守护进程 PID、开机自启 / 保持常开配置与复查间隔。
- 支持「立即开启 / 关闭」；关闭时若保持常开已启用，会二次确认并一并关闭保持常开，避免被守护进程立刻重开。
- 「诊断」输出 `/sys/class/xm_power/typec/` 的节点与权限、候选节点值、相关属性 / Settings、SELinux 上下文，便于排查节点或权限问题。

---

## 4. 默认曲线：K100PM 调整版

模块默认调音为 **K100PM 调整版**（`data/curves/k100pm_tuned.*`），在 `K100PM 配置 JSON` 的 `dolby-dap-20-v1` 20 段计划基础上微调：

| 频点 (Hz) | 47 | 141 | 234 | 328 | 469 | 656 | 844 | 1031 | 1313 | 1688 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 增益 (0.01 dB) | 320 | 299 | 126 | 80 | 96 | 36 | **800** | 14 | **-440** | 37 |
| dB | +3.20 | +2.99 | +1.26 | +0.80 | +0.96 | +0.36 | **+8.00** | +0.14 | **-4.40** | +0.37 |

| 频点 (Hz) | 2250 | 3000 | 3750 | 4688 | 5813 | 7125 | 9000 | 11250 | 13875 | 19688 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 增益 (0.01 dB) | 38 | 23 | 17 | 14 | **930** | 13 | 14 | 19 | 58 | 320 |
| dB | +0.38 | +0.23 | +0.17 | +0.14 | **+9.30** | +0.13 | +0.14 | +0.19 | +0.58 | +3.20 |

参考曲线仍为 `K100PM 基准曲线`（原始 JSON 数值，320/299/126/80/96/36/1/14/23/37/38/23/17/14/13/13/14/19/58/320），用于对照。

**映射规则**

- 单位：`gains_q4` 与 Dolby XML 的 `band_ieq target` / `band_geq gain` **同为 0.01 dB 定点**，按 1:1 写入（320 = +3.20 dB）。
- 频点：与 `dolby-dap-20-v1` 计划完全一致，导入时逐段校验。
- 写入位置：**IEQ 1/2/3**（`band_ieq target`）+ **GEQ 0/1/2/3/4/5/6**（`band_geq gain`），即「10 个槽位」。
- 说明：模块 `profile` 中 `ieq-enable=false`，因此 IEQ 曲线默认不参与实时处理（不会与 GEQ 叠加）；GEQ 为启用状态，默认曲线经由 GEQ 生效。若在 Dolby 界面手动开启 IEQ，请自行评估叠加量。

---

## 5. 配置生成与写入机制

1. `data/dax.template.xml` 为原始 `dax-default.xml` 的结构模板（10 个槽位处保留 `<!--#K100PM:IEQ1#-->` 之类的标记）。
2. `k100pm.sh apply` 读取 `data/slots.conf` 的槽位映射，从 `data/curves/<id>.gains` 取 20 段增益，生成真正的 `<ieq-bands>` / `<graphic-equalizer-bands>` 段。
3. 生成结果做结构自检（60 段 IEQ、140 段 GEQ、10 个 preset、结尾完整、无残留标记）。
4. 三份副本同源写入（`Link/`、`vendor/`、`factory/`），保持 SELinux 上下文 `vendor_configs_file`。
5. 已存在的 bind 挂载会直接读到新内容；未挂载时自动补 bind。
6. 「重启音频服务」使新曲线尽快生效；**重启手机最彻底**。

> 生成链路无损性已用「全部切回原厂曲线 → apply」验证：输出与备份文件逐字节一致（备份 MD5 `edbb40cb4793624433a885619c4ad939`，含当前默认头注释）。

---

## 6. 命令行（可选）

```sh
sh /data/adb/modules/k100pm_audio_plus/bin/k100pm.sh status
sh .../k100pm.sh snapshot          # WebUI 首屏一次拿全（status+curves+slots+props）
sh .../k100pm.sh curves | slots | props | log 120 | info | verify
sh .../k100pm.sh assign IEQ1 orig_ieq_warm
sh .../k100pm.sh assign-map IEQ1=flat GEQ0=k100pm_tuned   # 一次写多个槽位
sh .../k100pm.sh assign-all k100pm_base
sh .../k100pm.sh apply
sh .../k100pm.sh save-curve custom_x "我的曲线" 320 299 126 ...（20 个整数）
sh .../k100pm.sh delete-curve custom_x
sh .../k100pm.sh set-prop persist.vendor.dolby.bass.boost 8
sh .../k100pm.sh set-props persist.vendor.dolby.bass.boost=8 persist.vendor.dolby.virtualizer.amount=5
sh .../k100pm.sh reset
sh .../k100pm.sh reload audio
sh .../k100pm.sh reboot

# OTG
sh .../k100pm.sh otg status
sh .../k100pm.sh otg on | off
sh .../k100pm.sh otg config AUTO_ON=1 KEEP_ON=1 INTERVAL=30
sh .../k100pm.sh otg apply | stop | probe
```

全部命令输出 JSON，WebUI 与终端共用同一套逻辑。`snapshot` / `assign-map` / `set-props` 是 v1.4D 为减少 shell 往返新增的批量接口，旧命令保持兼容；`otg boot` 由 `service.sh` 开机调用，不需要手动执行。

---

## 7. 文件结构

```
k100pm_audio_plus/
├── module.prop
├── customize.sh            # 安装校验（新 MD5）+ 升级保留自定义曲线
├── post-fs-data.sh         # Link/vendor bind + SELinux 上下文
├── service.sh              # props.conf 注入 + 低功耗清理 + 媒体杜比化
├── uninstall.sh            # 解除挂载 / 清理残留
├── system.prop             # 音量阶数 / 安全音量等开机属性
├── sepolicy.rule
├── Link/odm/etc/...        # 目标曲线版 dax-default.xml + audio_effects_config + mixer_paths
├── vendor/etc/...          # 目标曲线版 dax-default.xml 等
├── factory/etc/dolby/...   # 出厂同源副本
├── bin/k100pm.sh           # 配置 CLI（WebUI 后端）
├── data/
│   ├── dax.template.xml    # 结构模板
│   ├── curves/             # 13 条内置曲线 + 自定义曲线
│   ├── slots.conf          # 槽位映射
│   ├── props.conf          # 运行时属性
│   ├── otg.conf            # OTG 开机自启 / 防超时配置
│   ├── backup/             # 出厂 dax-default.xml 备份
│   └── state/applied       # 最近一次写入记录
└── webroot/                # 内置 WebUI（离线）
    ├── index.html
    ├── css/app.css
    └── js/{bridge,graph,app,mockdata}.js
```

---

## 8. 注意事项

- 仅适配 **REDMI K100 Pro Max（songyuan）/ Android 15+**；安装脚本会校验设备代号、机型名、系统版本、Dolby 配置与文件 MD5，任一不匹配直接 abort，且不会修改任何文件。
- 修改曲线**不会**自动重采样音频，也不会改变扬声器保护、低功耗策略（由属性页控制）。
- 曲线数值范围限制 ±20 dB，超出会被裁剪；导入时自动校验 20 段与频点。
- 恢复出厂：WebUI「运行状态 → 恢复原厂曲线」，或用 `k100pm.sh reset`。
- OTG：默认关闭（`AUTO_ON=0`、`KEEP_ON=0`）。在 OTG 页打开两个开关并保存，或执行 `k100pm.sh otg config AUTO_ON=1 KEEP_ON=1` 后 `otg apply`。如果 OTG 页显示「未检测到节点」，先点「诊断」查看 `/sys/class/xm_power/typec/` 与 SELinux 上下文；仍不行可在 `data/otg.conf` 手动指定 `NODE`。
- OTG 处于 Host 模式时连接电脑可能无法识别为存储设备；需要连电脑时先关闭 OTG，或把 `KEEP_ON` 设为 `0`。
- 卸载会解除 `/odm`、`/vendor` 下的 bind 挂载，并停止 OTG 守护进程，重启后彻底失效。
