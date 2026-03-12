# Trustpilot Review Scraper

Extract reviews, ratings, and company profile data from [Trustpilot.com](https://www.trustpilot.com).

## What it does

This scraper extracts structured data from Trustpilot company review pages, including:

- **Reviews**: rating, title, full text, author info, dates, verification status, company replies
- **Company profiles**: trust score, total reviews, star distribution, categories

## Input

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `companyUrls` | string[] | *required* | Trustpilot URLs or domain names (e.g. `www.amazon.com` or `https://www.trustpilot.com/review/www.amazon.com`) |
| `maxReviewsPerCompany` | number | 100 | Max reviews per company. 0 = unlimited |
| `sortBy` | string | `recency` | Sort order: `recency` or `relevance` |
| `filterByStars` | string | `all` | Filter: `all`, `1`, `2`, `3`, `4`, `5` |
| `includeCompanyInfo` | boolean | `true` | Include company profile as first result |
| `proxyConfig` | object | Apify Proxy | Proxy settings |

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

### Review object

```json
{
    "type": "review",
    "companyName": "Amazon",
    "companyDomain": "www.amazon.com",
    "rating": 1,
    "reviewTitle": "Terrible customer service",
    "reviewText": "I ordered a product that never arrived...",
    "authorName": "John D.",
    "authorCountry": "US",
    "publishedDate": "2026-03-10T14:23:45.000Z",
    "experienceDate": "2026-03-05T00:00:00.000Z",
    "isVerified": true,
    "companyReply": "We're sorry to hear about your experience.",
    "reviewUrl": "https://www.trustpilot.com/reviews/62d02e3a..."
}
```

### Company profile object

```json
{
    "type": "companyInfo",
    "companyName": "Amazon",
    "companyDomain": "www.amazon.com",
    "trustScore": 1.7,
    "totalReviews": 44357,
    "averageRating": 1.7,
    "starDistribution": { "1": 29069, "2": 2845, "3": 1923, "4": 1925, "5": 8595 },
    "categories": ["Electronics", "Shopping"],
    "isClaimedProfile": true
}
```

## How it works

1. **Fast JSON extraction**: Reads structured data directly from Trustpilot's internal data (no slow HTML parsing)
2. **Automatic pagination**: Follows all review pages up to your `maxReviewsPerCompany` limit
3. **Proxy rotation**: Uses Apify Proxy to avoid rate limiting
4. **Multiple companies**: Scrape reviews for many companies in a single run

## Use cases

- **Competitor analysis**: Compare review sentiment across competitors
- **Brand monitoring**: Track how a company's reputation changes over time
- **Market research**: Analyze customer satisfaction in a specific industry
- **Review aggregation**: Collect reviews for display on dashboards or reports

## Cost estimate

Using Apify Proxy (datacenter), scraping ~1,000 reviews costs approximately $0.05-0.10 in platform usage.

## Limitations

- Trustpilot may rate-limit requests from the same IP. Use proxy rotation for large scrapes.
- Review data depends on what Trustpilot exposes publicly. Some reviewer details may be limited.
