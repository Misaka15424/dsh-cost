# dsh-cost-log

DSH 插件：在输入框旁显示当前对话的**费用与 Token 用量**，并根据 DeepSeek 官方定价自动计算。

支持历史对话累计统计，并根据**工作日、夜间、周末及法定节假日**自动匹配对应价格。

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log 输入框费用徽标演示" width="972">
</p>

## 功能

* 💰 显示当前对话累计费用
* 🔢 显示 Token 用量
* 📚 自动统计历史对话
* 🕐 根据日期与时间自动匹配 DeepSeek 对应价格
* 🖱️ 悬停费用徽标可看当前使用的模型与它对应的价格
* 💱 支持 CNY / USD 两种费用显示

  * 设置 → 通用 → 费用货币
* `≈` 表示该模型的费用为估算值

## 计费范围

仅统计 DSH 内置的 DeepSeek 官方模型。其他模型以 `≈` 标记，表示费用为估算值。

## 安装

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

安装完成后，**重启 DSH Web**。

### 卸载

```bash
dsh plugin --profile web remove github:Misaka15424/dsh-cost
```

> ⚠️ npm 上存在一个同名旧包，已经停止维护。请使用上面的 GitHub 安装方式。

## 要求

* DSH `0.1.5+`

## License

MIT

## 致谢

本项目基于 [kami-mura/dsh-cost](https://github.com/kami-mura/dsh-cost) 修改而来。
