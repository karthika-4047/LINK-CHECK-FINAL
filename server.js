const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { JSDOM } = require('jsdom');
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

function validateUrls(urls) {
    if (urls.length < 1 || urls.length > 20) {
        throw new Error('Please enter between 1 and 20 URLs');
    }

    // More permissive URL regex that allows common URL patterns
    const urlRegex = new RegExp(
        '^' +
        // Protocol
        'https?://' +
        // Domain name and optional port
        '([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(:[0-9]+)?' +
        // Path, query, and fragment
        '(/[^?#]*)?'+
        '(\\?[^#]*)?' +
        '(#.*)?' +
        '$'
    );

    const invalidUrls = urls.filter(url => !urlRegex.test(url));
    
    if (invalidUrls.length > 0) {
        throw new Error(`Invalid URL format: ${invalidUrls[0]}`);
    }

    return true;
}

// Helper function to normalize URLs before validation
function normalizeUrl(url) {
    try {
        // Remove any leading/trailing whitespace
        url = url.trim();
        
        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        // Create URL object to validate and normalize
        const urlObj = new URL(url);
        
        // Return normalized URL string
        return urlObj.toString();
    } catch (error) {
        throw new Error(`Invalid URL format: ${url}`);
    }
}


async function getFinalUrlWithStatus(url, maxRedirects = 5) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        clearTimeout(timeout);
        
        // Enhanced status handling
        const result = {
            url: response.url,
            statusCode: response.status,
            ok: response.ok,
            error: null
        };

        // Handle specific status codes
        switch (response.status) {
            case 403:
                result.error = 'Access Forbidden';
                break;
            case 404:
                result.error = 'Not Found';
                break;
            case 500:
                result.error = 'Server Error';
                break;
            case 408:
                result.error = 'Request Timeout';
                break;
        }

        // Check if URL is accessible
        if (!response.ok && !result.error) {
            result.error = `HTTP Error ${response.status}`;
        }

        return result;

    } catch (error) {
        const errorResult = { 
            url, 
            statusCode: 0, 
            ok: false
        };

        if (error.name === 'AbortError') {
            errorResult.statusCode = 408;
            errorResult.error = 'Request timed out';
        } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            errorResult.error = 'Network error or CORS restriction';
        } else {
            errorResult.error = error.message;
        }

        return errorResult;
    }
}

async function extractAllLinks(html, baseUrl) {
    try {
        const dom = new JSDOM(html);
        const links = Array.from(dom.window.document.querySelectorAll('a'))
            .map(a => a.getAttribute('href'))
            .filter(href => href && !href.startsWith('#') && !href.startsWith('javascript:'))
            .map(href => new URL(href, baseUrl).href);

        return [...new Set(links)];
    } catch (error) {
        console.error(`Error extracting links from ${baseUrl}:`, error);
        return [];
    }
}


async function extractAkaQueryLinks(html, baseUrl) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const links = Array.from(doc.getElementsByTagName('a'))
            .map(a => {
                try {
                    const href = a.getAttribute('href');
                    if (!href) return null;
                    return new URL(href, baseUrl).href;
                } catch (e) {
                    return null;
                }
            })
            .filter(url => url !== null && (url.includes('aka.ms') || url.includes('query.prod')));

        return [...new Set(links)];
    } catch (error) {
        console.error(`Error extracting aka/query links from ${baseUrl}:`, error);
        return [];
    }
}

async function extractSEOMetadata(html) {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const metaAttributes = {};
    const duplicateAttributes = [];

    // Select all meta tags with name or property attributes
    const metaTags = Array.from(doc.querySelectorAll('meta[name], meta[property]'));

    metaTags.forEach(meta => {
        const attributeValue = meta.getAttribute('name') || meta.getAttribute('property');
        
        if (attributeValue) {
            if (metaAttributes[attributeValue]) {
                // Duplicate found, add to duplicates if not already present
                if (!duplicateAttributes.includes(attributeValue)) {
                    duplicateAttributes.push(attributeValue);
                }
            } else {
                metaAttributes[attributeValue] = 1;
            }
        }
    });

    return duplicateAttributes;
}
//   if (duplicates.length > 0) {
//     return metadata.duplicates;
//   } else {
//     console.log('No duplicate meta tag attributes found.');
//   }
// }

//     return metadata.duplicates;
// }

async function extractCustomerStoryLinks(html, baseUrl) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const links = Array.from(doc.getElementsByTagName('a'))
            .map(a => {
                try {
                    const href = a.getAttribute('href');
                    if (!href) return null;
                    
                    // Handle relative URLs
                    let absoluteUrl;
                    try {
                        absoluteUrl = new URL(href, baseUrl).href;
                    } catch {
                        return null;
                    }
                    
                    // Check for customer stories URL
                    if (absoluteUrl.startsWith('https://customers.microsoft.com/en-us/story/')) {
                        return absoluteUrl;
                    }
                    return null;
                } catch {
                    return null;
                }
            })
            .filter(url => url !== null);

        return [...new Set(links)]; // Remove duplicates
    } catch (error) {
        console.error(`Error extracting customer story links from ${baseUrl}:`, error);
        return [];
    }
}




async function fetchUrl(url, fetchType = 'rt') {
    try {
        // Normalize URL before proceeding
        const normalizedUrl = normalizeUrl(url);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(normalizedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeout);

        const result = {
            sourceUrl: url,
            status: response.ok ? 'success' : 'error',
            statusCode: response.status
        };

        if (!response.ok) {
            result.error = `HTTP error! status: ${response.status}`;
            if (response.status === 403) {
                result.error = 'Access Forbidden - Consider authentication or checking access permissions';
            }
            return result;
        }

        const html = await response.text();

        console.log('fetchtype',fetchType)
        if (fetchType === 'rt') {
            // Extract both aka.ms and query.prod links
            const akaQueryLinks = await extractAkaQueryLinks(html, url);
            result.fetchedUrls = akaQueryLinks;
            
            // Get final destinations for each link
            const destinationResults = await Promise.all(
                akaQueryLinks.map(async (link) => {
                    try {
                        const finalUrl = await getFinalUrlWithStatus(link);
                        return {
                            originalUrl: link,
                            destinationUrl: finalUrl.url,
                            statusCode: finalUrl.statusCode,
                            error: finalUrl.error
                        };
                    } catch (error) {
                        return {
                            originalUrl: link,
                            destinationUrl: '',
                            statusCode: 0,
                            error: error.message
                        };
                    }
                })
            );
            
            result.destinationUrls = destinationResults;
        }
        
        else if (fetchType === 'broken') {
            const extractedLinks = await extractAllLinks(html, url);
            const brokenLinks = await Promise.all(
                extractedLinks.map(async (link) => {
                    const linkStatus = await getFinalUrlWithStatus(link);
                    return {
                        originalUrl: link,
                        destinationUrl: linkStatus.url,
                        statusCode: linkStatus.statusCode,
                        error: linkStatus.error,
                        redirected: linkStatus.url !== link
                    };
                })
            );

            result.brokenLinks = brokenLinks.filter(link =>
                link.statusCode >= 400 || link.error || link.statusCode === 0
            );
            result.totalLinks = extractedLinks.length;
        } 
        
        else if (fetchType === 'seo') {
            result.duplicates = await extractSEOMetadata(html);
        }

        else if (fetchType === 'customer-stories') {
            const html = await response.text();
            const customerStoryLinks = await extractCustomerStoryLinks(html, url);
            
            result.storyLinks = customerStoryLinks;
        }
        
        return result;
    } catch (error) {
        return {
            sourceUrl: url,
            status: 'error',
            error: error.message,
            statusCode: error.name === 'AbortError' ? 408 : 0,
            fetchedUrls: [],
            destinationUrls: []
        };
    }
}

// Helper function to extract aka.ms and query.prod links
async function extractAkaQueryLinks(html, baseUrl) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const links = Array.from(doc.getElementsByTagName('a'))
            .map(a => {
                try {
                    const href = a.getAttribute('href');
                    if (!href) return null;
                    
                    // Handle relative URLs
                    let absoluteUrl;
                    try {
                        absoluteUrl = new URL(href, baseUrl).href;
                    } catch {
                        return null;
                    }
                    
                    // Check for aka.ms or query.prod in the URL
                    if (absoluteUrl.includes('aka.ms') || absoluteUrl.includes('query.prod')) {
                        return absoluteUrl;
                    }
                    return null;
                } catch {
                    return null;
                }
            })
            .filter(url => url !== null);

        return [...new Set(links)]; // Remove duplicates
    } catch (error) {
        console.error(`Error extracting aka/query links from ${baseUrl}:`, error);
        return [];
    }
}


function countRedLinks(results) {
    let redLinksCount = 0;

    for (const result of results) {
        if (result.status === 'error') {
            redLinksCount++;
        } else if (result.destinationUrls) {
            redLinksCount += result.destinationUrls.filter(link => 
                link.statusCode >= 400 || 
                link.error || 
                link.statusCode === 0
            ).length;
        }
    }

    return redLinksCount;
}

app.post('/api/fetch-urls', async (req, res) => {
    try {
        let urls = req.body.urls;
        const fetchType = req.body.fetchType || 'rt';

        if (typeof urls === 'string') {
            urls = urls.split('\n').map(url => url.trim()).filter(url => url);
        } else if (!Array.isArray(urls)) {
            throw new Error('Invalid URLs format');
        }

        validateUrls(urls);

        const results = await Promise.all(urls.map(url => fetchUrl(url, fetchType)));

        res.json({
            success: true,
            results
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/check-description', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            throw new Error('URL parameter is required');
        }
        
        const result = await fetchUrl(url, 'seo');
        res.json({ 
            success: true,
            hasDuplicateSeo: result.duplicates.length > 0,
            Duplicates: result.duplicates
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Export for Vercel
module.exports = app;