import { CheerioCrawler, Dataset, type CheerioAPI } from '@crawlee/cheerio';
import { Actor, log } from 'apify';

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
    reviewId: string;
    rating: number;
    reviewTitle: string;
    reviewText: string;
    authorName: string;
    authorCountry: string;
    authorReviewCount: number;
    publishedDate: string;
    experienceDate: string;
    isVerified: boolean;
    language: string;
    likesCount: number;
    companyReply: string | null;
    companyReplyDate: string | null;
    reviewUrl: string;
}

interface CompanyResult {
    type: 'companyInfo';
    companyName: string;
    companyDomain: string;
    companyUrl: string;
    trustScore: number;
    totalReviews: number;
    averageRating: number;
    starDistribution: Record<string, number>;
    categories: string[];
    isClaimedProfile: boolean;
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
        // Extract domain from full URL and rebuild to ensure consistency
        const url = new URL(input);
        const pathParts = url.pathname.split('/').filter(Boolean);
        // Handle both /review/domain and bare domain inputs
        const domain = pathParts[pathParts.length - 1] || url.hostname;
        return `https://www.trustpilot.com/review/${domain}`;
    }
    // Bare domain
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

// ── Extraction: __NEXT_DATA__ (primary) ────────────────────────────────

function extractFromNextData($: CheerioAPI): {
    reviews: any[];
    companyInfo: any;
    filters: any;
    totalPages: number;
} | null {
    try {
        const scriptTag = $('script#__NEXT_DATA__');
        if (!scriptTag.length) return null;

        const json = JSON.parse(scriptTag.html() || '{}');
        const pageProps = json?.props?.pageProps;
        if (!pageProps) return null;

        const reviews = pageProps.reviews || [];
        const businessUnit = pageProps.businessUnit || {};
        const filters = pageProps.filters || {};

        const totalPages = filters.pagination?.totalPages
            || pageProps.pagination?.totalPages
            || Math.ceil((businessUnit.numberOfReviews || 0) / 20)
            || 1;

        return { reviews, companyInfo: businessUnit, filters, totalPages };
    } catch (e) {
        log.debug(`__NEXT_DATA__ parsing failed: ${(e as Error).message}`);
        return null;
    }
}

function mapNextDataReview(review: any, companyName: string, companyDomain: string, companyUrl: string): ReviewResult {
    const consumer = review.consumer || {};
    const dates = review.dates || {};
    const reply = review.reply || review.companyReply || null;
    const labels = review.labels || {};

    return {
        type: 'review',
        companyName,
        companyDomain,
        companyUrl,
        reviewId: review.id || '',
        rating: review.rating || 0,
        reviewTitle: review.title || '',
        reviewText: review.text || '',
        authorName: consumer.displayName || '',
        authorCountry: consumer.countryCode || consumer.displayLocation || '',
        authorReviewCount: consumer.numberOfReviews || 0,
        publishedDate: dates.publishedDate || review.createdAt || '',
        experienceDate: dates.experiencedDate || '',
        isVerified: labels?.verification?.isVerified || false,
        language: review.language || '',
        likesCount: review.likes || 0,
        companyReply: reply?.text || reply?.message || null,
        companyReplyDate: reply?.createdAt || reply?.publishedDate || null,
        reviewUrl: review.id ? `https://www.trustpilot.com/reviews/${review.id}` : '',
    };
}

function mapNextDataCompany(bu: any, filters: any, companyDomain: string, companyUrl: string): CompanyResult {
    // Star distribution is in filters.reviewStatistics.ratings
    const ratings = filters?.reviewStatistics?.ratings || {};
    return {
        type: 'companyInfo',
        companyName: bu.displayName || bu.name || companyDomain,
        companyDomain,
        companyUrl,
        trustScore: bu.trustScore || 0,
        totalReviews: bu.numberOfReviews || 0,
        averageRating: bu.stars || 0,
        starDistribution: {
            '1': ratings.one || 0,
            '2': ratings.two || 0,
            '3': ratings.three || 0,
            '4': ratings.four || 0,
            '5': ratings.five || 0,
        },
        categories: (bu.categories || []).map((c: any) => c.displayName || c.name || c),
        isClaimedProfile: bu.isClaimed || false,
    };
}

// ── Extraction: JSON-LD (fallback) ─────────────────────────────────────

function extractFromJsonLd($: CheerioAPI, companyDomain: string, companyUrl: string): {
    reviews: ReviewResult[];
    companyInfo: CompanyResult | null;
} {
    const reviews: ReviewResult[] = [];
    let companyInfo: CompanyResult | null = null;

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html() || '{}');

            // Handle @graph arrays
            const items = data['@graph'] || [data];
            for (const item of items) {
                if (item['@type'] === 'LocalBusiness' || item['@type'] === 'Organization') {
                    const agg = item.aggregateRating || {};
                    companyInfo = {
                        type: 'companyInfo',
                        companyName: item.name || companyDomain,
                        companyDomain,
                        companyUrl,
                        trustScore: 0,
                        totalReviews: parseInt(agg.reviewCount) || 0,
                        averageRating: parseFloat(agg.ratingValue) || 0,
                        starDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
                        categories: [],
                        isClaimedProfile: false,
                    };
                }

                if (item['@type'] === 'Review') {
                    reviews.push({
                        type: 'review',
                        companyName: '',
                        companyDomain,
                        companyUrl,
                        reviewId: '',
                        rating: parseInt(item.reviewRating?.ratingValue) || 0,
                        reviewTitle: item.headline || '',
                        reviewText: item.reviewBody || '',
                        authorName: item.author?.name || '',
                        authorCountry: '',
                        authorReviewCount: 0,
                        publishedDate: item.datePublished || '',
                        experienceDate: '',
                        isVerified: false,
                        language: item.inLanguage || '',
                        likesCount: 0,
                        companyReply: null,
                        companyReplyDate: null,
                        reviewUrl: '',
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

// ── Extraction: HTML (last resort) ─────────────────────────────────────

function extractTotalPagesFromHtml($: CheerioAPI): number {
    // Look for pagination nav
    const lastPageLink = $('nav[aria-label="Pagination"] a').last().text().trim();
    if (lastPageLink && !isNaN(Number(lastPageLink))) return parseInt(lastPageLink);

    // Alternative: look for pagination button with highest number
    let maxPage = 1;
    $('a[name^="pagination-button-"]').each((_, el) => {
        const text = $(el).text().trim();
        const num = parseInt(text);
        if (!isNaN(num) && num > maxPage) maxPage = num;
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

        // Try __NEXT_DATA__ first
        const nextData = extractFromNextData($);

        let reviews: ReviewResult[] = [];
        let totalPages = 1;

        if (nextData && nextData.reviews.length > 0) {
            // Primary extraction path
            const companyName = nextData.companyInfo?.displayName || nextData.companyInfo?.name || companyDomain;

            // Emit company info once
            if (includeCompanyInfo && !companyInfoEmitted && nextData.companyInfo) {
                const info = mapNextDataCompany(nextData.companyInfo, nextData.filters, companyDomain, companyBaseUrl);
                await Dataset.pushData(info);
                companyInfoEmitted = true;
            }

            reviews = nextData.reviews.map((r: any) =>
                mapNextDataReview(r, companyName, companyDomain, companyBaseUrl)
            );
            totalPages = nextData.totalPages;

            log.info(`[__NEXT_DATA__] Found ${reviews.length} reviews, ${totalPages} total pages`);
        } else {
            // Fallback to JSON-LD
            const jsonLd = extractFromJsonLd($, companyDomain, companyBaseUrl);

            if (includeCompanyInfo && !companyInfoEmitted && jsonLd.companyInfo) {
                await Dataset.pushData(jsonLd.companyInfo);
                companyInfoEmitted = true;
            }

            reviews = jsonLd.reviews;
            totalPages = extractTotalPagesFromHtml($);

            log.info(`[JSON-LD] Found ${reviews.length} reviews, ${totalPages} total pages`);
        }

        // Trim to maxReviews limit
        if (maxReviewsPerCompany > 0) {
            const remaining = maxReviewsPerCompany - reviewCount;
            if (remaining <= 0) return;
            reviews = reviews.slice(0, remaining);
        }

        // Push reviews
        if (reviews.length > 0) {
            await Dataset.pushData(reviews);
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
        } else {
            log.info(`Finished all ${totalPages} pages for ${companyDomain} (${reviewCount} reviews total)`);
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
