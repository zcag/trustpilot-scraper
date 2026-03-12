# Deploy Trustpilot Review Scraper to Apify

## Prerequisites

```bash
npm install -g apify-cli
apify login  # follow prompts to enter your API token from https://console.apify.com/account#/integrations
```

## Deploy

```bash
cd ~/mill/work/trustpilot-scraper
apify push
```

That's it. The actor will be built and deployed to your Apify account.

## Set up monetization

1. Go to https://console.apify.com → your actor → **Publication** tab
2. Click **Monetization** → choose **Pay Per Event**
3. Set event name: `result-item`, price: **$0.50 per 1,000 results** ($0.0005/result)
4. Write a store listing description (README.md content works)
5. Submit for review

## Test on Apify

After `apify push`, go to Console → Actor → click **Start** with default input to verify it works with Apify Proxy.

## Pricing rationale

- Competitors charge $3/month (rental) or $0.001/result
- We charge $0.50/1K results — cheaper than per-result competitors, more attractive than rental
- At 100K results/month = $50/month revenue ($40 after 20% Apify commission)
- Platform cost per 1K results: ~$0.05 → healthy margin
