import { CheerioCrawler, type CheerioAPI } from '@crawlee/cheerio';
import { Actor, Dataset, log } from 'apify';

// ── Types ──────────────────────────────────────────────────────────────

interface Input {
    companyUrls: string[];
    maxReviewsPerCompany?: number;
    sortBy?: 'recency' | 'relevance';
    filterByStars?: 'all' | '1' | '2' | '3' | '4' | '5';
    includeCompanyInfo?: boolean;
    proxyConfig?: object;
}

interface ReviewResult {
    type: 'review';
    companyName: string;
    companyDomain: string;
    companyUrl: string;
    rating: number;
    reviewTitle: string;
    reviewText: string;
    authorName: string;
    publishedDate: string;
    language: string;
    reviewUrl: string;
}

interface CompanyResult {
    type: 'companyInfo';
    companyName: string;
    companyDomain: string;
    companyUrl: string;
    totalReviews: number;
    averageRating: number;
    starDistribution: Record<string, number>;
}

interface UserData {
    label: 'REVIEW_PAGE';
    companyDomain: string;
    companyBaseUrl: string;
    reviewCount: number;
    companyInfoEmitted: boolean;
}

// ── Init ───────────────────────────────────────────────────────────────

await Actor.init();

const {
    companyUrls = [],
    maxReviewsPerCompany = 100,
    sortBy = 'recency',
    filterByStars = 'all',
    includeCompanyInfo = true,
    proxyConfig,
} = (await Actor.getInput<Input>()) ?? ({} as Input);

if (companyUrls.length === 0) {
    log.error('No company URLs provided. Exiting.');
    await Actor.exit({ exitCode: 1 });
}

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);

// ── URL helpers ────────────────────────────────────────────────────────

function normalizeCompanyUrl(input: string): string {
    if (input.startsWith('http')) {
        const url = new URL(input);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const domain = pathParts[pathParts.length - 1] || url.hostname;
        return `https://www.trustpilot.com/review/${domain}`;
    }
    return `https://www.trustpilot.com/review/${input}`;
}

function extractDomain(url: string): string {
    const match = url.match(/\/review\/([^?#/]+)/);
    return match ? match[1] : url;
}

function buildPageUrl(baseUrl: string, page: number): string {
    const url = new URL(baseUrl);
    if (page > 1) url.searchParams.set('page', String(page));
    if (sortBy !== 'recency') url.searchParams.set('sort', sortBy);
    if (filterByStars !== 'all') url.searchParams.set('stars', filterByStars);
    return url.href;
}

// ── Extraction: JSON-LD (primary) ──────────────────────────────────────

function extractFromJsonLd($: CheerioAPI, companyDomain: string, companyUrl: string): {
    reviews: ReviewResult[];
    companyInfo: CompanyResult | null;
} {
    const reviews: ReviewResult[] = [];
    let companyInfo: CompanyResult | null = null;
    const starDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html() || '{}');
            const items = data['@graph'] || [data];

            for (const item of items) {
                if (item['@type'] === 'LocalBusiness' || item['@type'] === 'Organization') {
                    const agg = item.aggregateRating || {};
                    companyInfo = {
                        type: 'companyInfo',
                        companyName: item.name || companyDomain,
                        companyDomain,
                        companyUrl,
                        totalReviews: parseInt(agg.reviewCount) || 0,
                        averageRating: parseFloat(agg.ratingValue) || 0,
                        starDistribution,
                    };
                }

                // Dataset type contains rating distribution
                if (item['@type'] === 'Dataset' && item.distribution) {
                    for (const dist of item.distribution) {
                        const name = dist.name || '';
                        const match = name.match(/(\d)\s*star/i);
                        if (match) {
                            const stars = match[1];
                            // Try to get count from description or other fields
                            const descMatch = (dist.description || '').match(/(\d[\d,]*)/);
                            if (descMatch) {
                                starDistribution[stars] = parseInt(descMatch[1].replace(/,/g, '')) || 0;
                            }
                        }
                    }
                }

                if (item['@type'] === 'Review') {
                    reviews.push({
                        type: 'review',
                        companyName: '',
                        companyDomain,
                        companyUrl,
                        rating: parseInt(item.reviewRating?.ratingValue) || 0,
                        reviewTitle: item.headline || '',
                        reviewText: item.reviewBody || '',
                        authorName: item.author?.name || '',
                        publishedDate: item.datePublished || '',
                        language: item.inLanguage || '',
                        reviewUrl: item.url || '',
                    });
                }
            }
        } catch {
            // skip malformed JSON-LD
        }
    });

    // Fill in company name on reviews
    if (companyInfo) {
        for (const r of reviews) {
            r.companyName = (companyInfo as CompanyResult).companyName;
        }
    }

    return { reviews, companyInfo };
}

// ── Pagination: HTML-based detection ───────────────────────────────────

function extractTotalPagesFromHtml($: CheerioAPI): number {
    // Look for pagination nav
    const lastPageLink = $('nav[aria-label="Pagination"] a').last().text().trim();
    if (lastPageLink && !isNaN(Number(lastPageLink))) return parseInt(lastPageLink);

    // Look for pagination buttons with numbers
    let maxPage = 1;
    $('a[name^="pagination-button-"], a[href*="page="]').each((_, el) => {
        const text = $(el).text().trim();
        const num = parseInt(text);
        if (!isNaN(num) && num > maxPage) maxPage = num;

        // Also check href for page= parameter
        const href = $(el).attr('href') || '';
        const hrefMatch = href.match(/page=(\d+)/);
        if (hrefMatch) {
            const hrefPage = parseInt(hrefMatch[1]);
            if (hrefPage > maxPage) maxPage = hrefPage;
        }
    });

    return maxPage;
}

// ── Crawler ────────────────────────────────────────────────────────────

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 5000,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 60,
    additionalMimeTypes: ['application/json'],
    requestHandler: async ({ request, $, crawler: c }) => {
        const userData = request.userData as UserData;
        const { companyDomain, companyBaseUrl } = userData;
        let { reviewCount, companyInfoEmitted } = userData;

        log.info(`Processing ${request.url} (${reviewCount} reviews so far for ${companyDomain})`);

        // Extract from JSON-LD (primary path)
        const jsonLd = extractFromJsonLd($, companyDomain, companyBaseUrl);

        if (includeCompanyInfo && !companyInfoEmitted && jsonLd.companyInfo) {
            await Actor.pushData(jsonLd.companyInfo);
            companyInfoEmitted = true;
        }

        let reviews = jsonLd.reviews;

        // Try HTML pagination detection
        let totalPages = extractTotalPagesFromHtml($);

        log.info(`[JSON-LD] Found ${reviews.length} reviews, ${totalPages} total pages detected`);

        // Trim to maxReviews limit
        if (maxReviewsPerCompany > 0) {
            const remaining = maxReviewsPerCompany - reviewCount;
            if (remaining <= 0) return;
            reviews = reviews.slice(0, remaining);
        }

        // Push reviews (PPE: charge per result)
        if (reviews.length > 0) {
            await Actor.pushData(reviews, 'result');
            reviewCount += reviews.length;
            log.info(`Pushed ${reviews.length} reviews (total: ${reviewCount}) for ${companyDomain}`);
        }

        // Check if we should continue paginating
        if (maxReviewsPerCompany > 0 && reviewCount >= maxReviewsPerCompany) {
            log.info(`Reached max reviews (${maxReviewsPerCompany}) for ${companyDomain}`);
            return;
        }

        // Enqueue next page
        const currentUrl = new URL(request.url);
        const currentPage = parseInt(currentUrl.searchParams.get('page') || '1');

        if (currentPage < totalPages) {
            // Known total pages — enqueue next
            const nextUrl = buildPageUrl(companyBaseUrl, currentPage + 1);
            await c.addRequests([{
                url: nextUrl,
                userData: {
                    label: 'REVIEW_PAGE' as const,
                    companyDomain,
                    companyBaseUrl,
                    reviewCount,
                    companyInfoEmitted,
                },
            }]);
        } else if (reviews.length > 0 && totalPages <= 1 && currentPage < 100) {
            // No pagination detected but we got reviews — try next page speculatively (capped at 100)
            const nextUrl = buildPageUrl(companyBaseUrl, currentPage + 1);
            await c.addRequests([{
                url: nextUrl,
                userData: {
                    label: 'REVIEW_PAGE' as const,
                    companyDomain,
                    companyBaseUrl,
                    reviewCount,
                    companyInfoEmitted,
                },
            }]);
            log.info(`Speculatively trying page ${currentPage + 1} (total pages unknown)`);
        } else {
            log.info(`Finished all pages for ${companyDomain} (${reviewCount} reviews total)`);
        }
    },

    failedRequestHandler: async ({ request }, error) => {
        log.error(`Request failed: ${request.url} — ${error.message}`);
    },
});

// ── Build start URLs ───────────────────────────────────────────────────

const startUrls = companyUrls.map((input) => {
    const baseUrl = normalizeCompanyUrl(input);
    const domain = extractDomain(baseUrl);
    return {
        url: buildPageUrl(baseUrl, 1),
        userData: {
            label: 'REVIEW_PAGE' as const,
            companyDomain: domain,
            companyBaseUrl: baseUrl,
            reviewCount: 0,
            companyInfoEmitted: false,
        },
    };
});

log.info(`Starting scraper for ${startUrls.length} companies: ${startUrls.map(u => u.userData.companyDomain).join(', ')}`);

await crawler.run(startUrls);

const datasetInfo = await Dataset.open().then(d => d.getInfo());
log.info(`Done. Total items in dataset: ${datasetInfo?.itemCount ?? 0}`);

await Actor.exit();
