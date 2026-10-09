# dsh-cost-log

A DSH plugin that displays the **current conversation cost and token usage** next to the input box.

It automatically calculates costs according to DeepSeek's official pricing, including different rates for **weekday daytime, nights, weekends, and public holidays**.

Historical messages are included in the calculation.

<p align="center">
  <img src="./docs/assets/cost-badge-preview.jpg" alt="dsh-cost-log cost badge beside the message composer" width="972">
</p>

## Features

* 💰 Display the accumulated cost of the current conversation
* 🔢 Display token usage
* 📚 Include historical messages in the calculation
* 🕐 Automatically apply the appropriate DeepSeek pricing based on date and time
* 🖱️ Hover over the cost badge to see the model in use and its price
* 💱 Support CNY / USD display

  * Settings → General → Cost Currency
* `≈` means the amount covers only the priced part

## Pricing Scope

Costs are calculated only for DSH's built-in official DeepSeek models — both the API-key route and the signed-in account route. Calls outside that scope are not priced, and the badge marks the amount with `≈` to show it covers only the priced part.

## Installation

```bash
dsh plugin --profile web add github:Misaka15424/dsh-cost
```

Restart **DSH Web** after installation.

### Uninstall

```bash
dsh plugin --profile web remove github:Misaka15424/dsh-cost
```

> ⚠️ An old, discontinued npm package with the same name exists. **Do not install it.** Use the GitHub installation command above.

## Requirements

* DSH `0.1.5+`

## License

MIT

## Credits

Based on [kami-mura/dsh-cost](https://github.com/kami-mura/dsh-cost).
