# Trustpilot Review Scraper

Extract reviews, ratings, and company profile data from [Trustpilot.com](https://www.trustpilot.com) — the world's largest review platform with over 300 million reviews across 1 million+ businesses.

Collect structured review data including star ratings, review text, author information, publication dates, and company-level aggregates. Built for brand monitoring, competitive analysis, and market research at any scale.

## What data can you extract from Trustpilot?

| Field | Example |
|-------|---------|
| Star rating | 1-5 |
| Review title | "Terrible customer service" |
| Full review text | Complete review content |
| Author name | "John D." |
| Published date | "2026-03-10T14:23:45.000Z" |
| Language | "en" |
| Review URL | Direct link to review |
| Company name | "Amazon" |
| Company domain | "www.amazon.com" |
| Total reviews | 44,357 |
| Average rating | 1.7 |
| Star distribution | Per-star breakdown |

## How to scrape Trustpilot reviews

1. Click **Try for free** to open the Actor in Apify Console
2. Enter company domains or Trustpilot URLs (e.g., `www.amazon.com` or `https://www.trustpilot.com/review/www.tesla.com`)
3. Set the maximum number of reviews per company
4. Optionally sort by recency or relevance, and filter by star rating
5. Click **Start** and wait for the run to finish
6. Download results as JSON, CSV, or Excel — or access via the Apify API

Schedule automatic runs to track review trends over time. Connect to Google Sheets, Slack, Zapier, or webhooks for real-time notifications.

## Input

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `companyUrls` | string[] | Trustpilot URLs or domain names (e.g., `www.amazon.com` or `https://www.trustpilot.com/review/www.tesla.com`) | required |
| `maxReviewsPerCompany` | number | Max reviews per company. 0 = unlimited. | 100 |
| `sortBy` | string | `recency` (newest first) or `relevance` | `recency` |
| `filterByStars` | string | `all`, `1`, `2`, `3`, `4`, or `5` | `all` |
| `includeCompanyInfo` | boolean | Include company profile with aggregate statistics | true |
| `proxyConfig` | object | Proxy configuration | Apify Proxy (datacenter) |

### Example input

```json
{
    "companyUrls": [
        "www.amazon.com",
        "https://www.trustpilot.com/review/www.tesla.com"
    ],
    "maxReviewsPerCompany": 500,
    "sortBy": "recency",
    "filterByStars": "all",
    "includeCompanyInfo": true
}
```

## Output

### Review

```json
{
    "type": "review",
    "companyName": "Amazon",
    "companyDomain": "www.amazon.com",
    "rating": 1,
    "reviewTitle": "Terrible customer service",
    "reviewText": "I ordered a product that never arrived...",
    "authorName": "John D.",
    "publishedDate": "2026-03-10T14:23:45.000Z",
    "language": "en",
    "reviewUrl": "https://www.trustpilot.com/reviews/62d02e3a..."
}
```

### Company profile

```json
{
    "type": "companyInfo",
    "companyName": "Amazon",
    "companyDomain": "www.amazon.com",
    "totalReviews": 44357,
    "averageRating": 1.7,
    "starDistribution": { "1": 29069, "2": 2845, "3": 1923, "4": 1925, "5": 8595 }
}
```

## Pricing

Pay only for results — no monthly subscription, no compute charges.

| Reviews | Cost |
|---------|------|
| 1,000 | $0.50 |
| 5,000 | $2.50 |
| 10,000 | $5.00 |
| 50,000 | $25.00 |

Platform usage (proxy, compute) is minimal — CheerioCrawler uses HTTP requests only, no browser needed. ~$0.05-0.10 per 1,000 reviews in platform costs on top of the per-result fee.

## Try it free

Every Apify account includes free credits. Set `maxReviewsPerCompany: 10` to preview the data format and verify it fits your workflow — no payment method required.

## Use cases

- **Brand monitoring** — Track how your company's Trustpilot rating and review volume change over time. Schedule weekly scrapes and get notified of negative review spikes.
- **Competitive analysis** — Compare review sentiment, ratings, and complaint types across competitors in your industry.
- **Market research** — Analyze customer satisfaction patterns before entering a market or launching a product.
- **Review aggregation** — Collect Trustpilot reviews for internal dashboards, reports, or business intelligence tools.
- **Sentiment analysis** — Feed structured review data into NLP models. Each review includes the rating, full text, and publication date for time-series analysis.
- **Due diligence** — Assess a company's customer satisfaction before partnerships, acquisitions, or investments.

## Is it legal to scrape Trustpilot?

Web scraping of publicly available data is generally legal. Trustpilot reviews are publicly accessible without login. This Actor only collects publicly visible information.

For more context, see [Is web scraping legal?](https://blog.apify.com/is-web-scraping-legal/) on the Apify blog. Always review applicable terms of service and data protection regulations for your use case.

## Tips

- **Use domain names as input**: You can enter `www.amazon.com` directly — no need to construct Trustpilot URLs manually.
- **Start with a small test**: Set `maxReviewsPerCompany: 10` to preview the output format before large runs.
- **Filter negative reviews**: Use `filterByStars: "1"` to focus on complaints for customer service analysis.
- **Multi-company runs**: Scrape dozens of companies in a single run for industry-wide analysis.

## Why this scraper?

- **JSON-LD extraction** — extracts from Trustpilot's structured data markup, not fragile DOM selectors. More reliable than HTML parsing.
- **Pay-per-result** — you only pay for reviews extracted ($0.50/1K), not compute time. No reviews = no charge.
- **No browser needed** — uses CheerioCrawler (HTTP only), so runs are fast and cheap.

## API access

Call this Actor programmatically from any language:

```bash
curl "https://api.apify.com/v2/acts/quasi_grass~trustpilot-review-scraper/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -d '{"companyUrls": ["www.amazon.com"], "maxReviewsPerCompany": 100}'
```

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("quasi_grass/trustpilot-review-scraper").call(
    run_input={"companyUrls": ["www.amazon.com"], "maxReviewsPerCompany": 100}
)
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item)
```

Works with Google Sheets, Zapier, Make, Slack, and 100+ integrations via the [Apify platform](https://docs.apify.com/integrations).

## Technical details

- Extracts data from Trustpilot's JSON-LD schema markup (20 reviews per page)
- Automatic pagination through all review pages
- Proxy rotation to avoid rate limiting

## Related scrapers

Combine with our other review platform scrapers for cross-platform reputation analysis:

- [PissedConsumer Reviews Scraper](https://apify.com/quasi_grass/pissedconsumer-review-scraper)
- [SiteJabber Reviews Scraper](https://apify.com/quasi_grass/sitejabber-review-scraper)
- [ConsumerAffairs Reviews Scraper](https://apify.com/quasi_grass/consumeraffairs-review-scraper)
