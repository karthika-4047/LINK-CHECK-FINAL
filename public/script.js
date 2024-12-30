document.addEventListener('DOMContentLoaded', function() {
    // DOM Element References
    const urlInput = document.getElementById('urlInput');
    const fetchButton = document.getElementById('fetchButton');
    const checkBrokenLinksButton = document.getElementById('checkBrokenLinksButton');
    const checkDuplicateDescriptionButton = document.getElementById('checkDuplicateDescriptionButton');
    const fetchCustomerStoriesButton = document.getElementById('fetchCustomerStoriesButton');
    const resultsSection = document.getElementById('resultsSection');
    const resultsBody = document.getElementById('resultsBody');
    const resultsTableHead = document.getElementById('resultsTableHead');
    const statisticsSection = document.getElementById('statisticsSection');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // State variables
    let currentView = 'rt';
    let fetchedResults = [];

    // Update table headers based on current view
    function updateTableHeaders(view) {
        let headerHTML = '<tr>';
        switch(view) {
            case 'rt':
                headerHTML += `
                    <th>Source URL</th>
                    <th>URLs Fetched</th>
                    <th>Redirecting URLs</th>
                `;
                break;
            case 'broken':
                headerHTML += `
                    <th width="30%">Source URL</th>
                    <th width="50%">Broken Links</th>
                    <th width="20%">Status</th>
                `;
                break;
            case 'seo':
                headerHTML += `
                    <th>URL</th>
                    <th colspan="2">SEO Duplicates</th>
                `;
                break;
                case 'customer-stories':
                    headerHTML += `
                        <th>Source URL</th>
                        <th>Customer Story Links</th>
                    `;
                    break;
            
        }
        headerHTML += '</tr>';
        resultsTableHead.innerHTML = headerHTML;
    }

    // Helper functions for status handling
    function getStatusClass(statusCode) {
        if (statusCode === 404) return 'status-code-404';
        if (!statusCode || statusCode === 0) return 'connection-error';
        if (statusCode >= 500) return 'server-error';
        if (statusCode >= 400) return 'client-error';
        if (statusCode >= 300) return 'redirect';
        return 'success';
    }
    


    // function getStatusClass(statusCode) {
    //     if (!statusCode || statusCode === 0) return 'connection-error';
    //     if (statusCode >= 500) return 'server-error';
    //     if (statusCode >= 400) return 'client-error';
    //     if (statusCode >= 300) return 'redirect';
    //     return 'success';
    // }

    // function getStatusText(link) {
    //     if (link.error) return link.error;
    //     if (!link.statusCode || link.statusCode === 0) return 'Connection Failed';
    //     if (link.statusCode === 404) return '404 Not Found';
    //     if (link.statusCode === 403) return '403 Forbidden';
    //     if (link.statusCode === 500) return '500 Server Error';
    //     if (link.statusCode === 408) return '408 Timeout';
    //     return `Status ${link.statusCode}`;
    // }
    // function getStatusText(link) {
    //     if (link.error) return `Error (${link.error})`;
    //     return link.statusCode ? `${link.statusCode}` : 'N/A';
    // }
    function getStatusText(link) {
        if (link.statusCode === 0) return 'Status 0'; // or 'Connection Failed' for a more user-friendly message
        if (link.error) return `Error (${link.error})`;
        return link.statusCode ? `Status ${link.statusCode}` : 'N/A';
    }

    // API call function
    async function fetchUrls(fetchType = 'rt') {
        console.log('fetchtype',fetchType)
        const urls = urlInput.value.split('\n').filter(url => url.trim());

        try {
            const response = await fetch(`${window.location.origin}/api/fetch-urls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ urls, fetchType }),
            });

            console.log('response',response)

            const data = await response.json();
            console.log('data',data)

            if (!response.ok) {
                throw new Error(data.error || 'Error fetching URLs');
            }

            return data.results;
        } catch (error) {
            throw new Error(error.message);
        }
    }


    async function checkDescriptionDuplicates(fetchType = 'seo') {
        try {
            const response = await fetch(`${window.location.origin}/api/check-description?url=${encodeURIComponent(url)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                throw new Error(data.error || 'Error checking description duplicates');
            }
    
            return data;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    // Display results based on current view

    function extractSEOMetadata(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
    
        const metaAttributes = {};
        const duplicates = [];
    
        // Select all meta tags with name or property attributes
        const metaTags = Array.from(doc.querySelectorAll('meta[name], meta[property]'));
    
        metaTags.forEach(meta => {
            const attributeValue = meta.getAttribute('name') || meta.getAttribute('property');
            
            if (attributeValue) {
                if (metaAttributes[attributeValue]) {
                    // Duplicate found, add to duplicates if not already present
                    if (!duplicates.includes(attributeValue)) {
                        duplicates.push(attributeValue);
                    }
                } else {
                    metaAttributes[attributeValue] = 1;
                }
            }
        });
    
        return duplicates;
    }

// New function to filter customer story links
function extractCustomerStoryLinks(html, baseUrl) {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Find all anchor tags
    const links = Array.from(tempDiv.getElementsByTagName('a'))
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

    // Remove duplicates
    return [...new Set(links)];
}

    
     // Modified displayResults function - fixing RT display logic
     function displayResults(results, view) {
        resultsBody.innerHTML = '';
        console.log('results',results)
        console.log('view',view)
        switch (view) {
            case 'rt':
                let akaToQueryProdCount = 0;
                let directQueryProdCount = 0;
    
                results.forEach(result => {
                    const row = document.createElement('tr');
                    const statusClass = result.status === 'error' ? 'error-row' : '';
                    row.className = statusClass;
    
                    if (result.status === 'error') {
                        // Handle error case
                        row.innerHTML = `
                            <td>
                                <div class="url-cell">${result.sourceUrl}</div>
                                <div class="error-message">${result.error}</div>
                            </td>
                            <td colspan="2">Error fetching URLs</td>
                        `;
                    } else {
                        let urlsHtml = '';
                        // Ensure we're checking for arrays before processing
                        const fetchedUrls = Array.isArray(result.fetchedUrls) ? result.fetchedUrls : [];
                        const destinationUrls = Array.isArray(result.destinationUrls) ? result.destinationUrls : [];
                        
                        // Use fetchedUrls length for iteration
                        fetchedUrls.forEach((fetchedUrl, i) => {
                            const destinationInfo = destinationUrls[i] || {};
                            const destinationUrl = destinationInfo.destinationUrl || '';
                            
                            const isQueryProd = fetchedUrl.includes('query.prod') || destinationUrl.includes('query.prod');
                            const isAkaMs = fetchedUrl.includes('aka.ms');
    
                            if (isAkaMs && isQueryProd) {
                                akaToQueryProdCount++;
                            } else if (isQueryProd) {
                                directQueryProdCount++;
                            }
    
                            urlsHtml += `<tr>
                                <td width="50%">
                                    <div class="url-cell ${isAkaMs ? 'aka-ms-highlight' : ''} ${isQueryProd ? 'query-prod-highlight' : ''}">
                                        <a href="${fetchedUrl}" target="_blank">${fetchedUrl}</a>
                                    </div>
                                </td>
                                <td width="50%">
                                    <div class="url-cell ${isQueryProd ? 'query-prod-highlight' : ''}">
                                        <a href="${destinationUrl}" target="_blank">${destinationUrl}</a>
                                        ${destinationInfo.error ? `<div class="error-message">${destinationInfo.error}</div>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        });
    
                        row.innerHTML = `
                            <td>
                                <div class="url-cell">${result.sourceUrl}</div>
                            </td>
                            <td colspan="2">
                                <table class="inner-table">
                                    <tbody>${urlsHtml}</tbody>
                                </table>
                            </td>
                        `;
                    }
                    
                    resultsBody.appendChild(row);
                });
    
                document.getElementById('akaToQueryCount').textContent = akaToQueryProdCount;
                document.getElementById('directQueryCount').textContent = directQueryProdCount;
                statisticsSection.style.display = 'block';
                break;

            case 'broken':
                results.forEach(result => {
                    const row = document.createElement('tr');
                    
                    if (result.status === 'error') {
                        // Error case: entire source URL failed to be processed
                        row.innerHTML = `
                            <td>
                                <div class="url-cell">${result.sourceUrl}</div>
                                <div class="error-message">${result.error}</div>
                            </td>
                            <td colspan="2" class="error-message">Failed to check links</td>
                        `;
                    } else {
                        const brokenLinks = result.brokenLinks || [];
                        
                        if (brokenLinks.length === 0) {
                            // No broken links case
                            row.innerHTML = `
                                <td>
                                    <div class="url-cell">${result.sourceUrl}</div>
                                </td>
                                <td>
                                    <div class="success-message">No broken links</div>
                                </td>
                                <td>-</td>
                            `;
                        } else {
                            // Broken links case
                            brokenLinks.forEach(link => {
                                const linkRow = document.createElement('tr');
                                
                                linkRow.innerHTML = `
                                    <td>
                                        <div class="url-cell">${result.sourceUrl}</div>
                                    </td>
                                    <td>
                                        <div class="broken-link-item">
                                            <a href="${link.originalUrl}" target="_blank">${link.originalUrl}</a>
                                            ${link.redirected ? `
                                                <div class="redirect-chain">
                                                    ➔ <a href="${link.destinationUrl}" target="_blank">${link.destinationUrl}</a>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </td>
                                    <td>
                                    <div class="status-code ${getStatusClass(link.statusCode)}">
    ${link.statusCode === 0 ? '0' : link.statusCode} 
    ${link.statusCode !== 0 && link.error ? `(${link.error})` : ''}
</div>
                                        
                                    </td>
                                `;
    
                                resultsBody.appendChild(linkRow);
                            });
    
                            // Summary row for each source URL
                            row.innerHTML = `
                                <td>
                                    <div class="url-cell">${result.sourceUrl}</div>
                                    <div class="summary-text">
                                        <span class="error-text">
                                            ${brokenLinks.length} broken ${brokenLinks.length === 1 ? 'link' : 'links'}
                                        </span> out of ${result.totalLinks} total
                                    </div>
                                </td>
                                <td colspan="2"></td>
                            `;
                        }
                    }
    
                    resultsBody.appendChild(row);
                });
                break;
                case 'seo':
                    results.forEach(result => {
                        console.log('result', result);
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td><div class="url-cell">${result.sourceUrl}</div></td>
                            <td colspan="2">
                                ${result.duplicates?.length > 0 
                                    ? result.duplicates.map(duplicates => `
                                        <div class="url-cell">
                                            <strong>Duplicate Meta Tag Attribute:</strong><br>
                                            ${duplicates}
                                        </div>
                                    `).join('') 
                                    : '<div class="success-message">No duplicate meta tag attributes found</div>'}
                            </td>
                        `;
                        resultsBody.appendChild(row);
                    });
                    break;
                    case 'customer-stories':
            results.forEach(result => {
                const row = document.createElement('tr');
                
                if (result.status === 'error') {
                    row.innerHTML = `
                        <td>
                            <div class="url-cell">${result.sourceUrl}</div>
                            <div class="error-message">${result.error}</div>
                        </td>
                        <td>Error fetching customer story links</td>
                    `;
                } else {
                    const storiesHtml = result.storyLinks.map(link => `
                        <div class="url-cell">
                            <a href="${link}" target="_blank">${link}</a>
                        </div>
                    `).join('');

                    row.innerHTML = `
                        <td><div class="url-cell">${result.sourceUrl}</div></td>
                        <td>
                            ${result.storyLinks.length > 0 
                                ? storiesHtml 
                                : '<div class="success-message">No customer story links found</div>'}
                        </td>
                    `;
                }
                
                resultsBody.appendChild(row);
            });
            break;
        }
    }
    //     if (view !== 'rt') {
    //         statisticsSection.style.display = 'none';
    //     }
    
    //     resultsSection.style.display = 'block';
    // }
    

    // Handle fetch operations
    async function handleFetch(type) {
        loadingSpinner.style.display = 'flex';
        resultsSection.style.display = 'none';
        statisticsSection.style.display = 'none';
    
        try {
            const urls = urlInput.value.split('\n').filter(url => url.trim());
            if (urls.length === 0) {
                throw new Error('Please enter at least one URL');
            }
    
            currentView = type;
            updateTableHeaders(type);
    
            let results;
            if (type === 'seo') {
                results = await Promise.all(urls.map(async (url) => {
                    try {
                        const response = await fetch(url);
                        const html = await response.text();
                        
                        return {
                            sourceUrl: url,
                            duplicates: extractSEOMetadata(html)
                        };
                    } catch (error) {
                        return {
                            sourceUrl: url,
                            status: 'error',
                            error: error.message
                        };
                    }
                }));
            } else
            
            if (type === 'customer-stories') {
                results = await Promise.all(urls.map(async (url) => {
                    try {
                        const response = await fetch(url);
                        const html = await response.text();
                        
                        return {
                            sourceUrl: url,
                            storyLinks: await extractCustomerStoryLinks(html, url)
                        };
                    } catch (error) {
                        return {
                            sourceUrl: url,
                            status: 'error',
                            error: error.message
                        };
                    }
                }));
            }
else


            
            {
                // Existing approach for 'rt' and 'broken'
                results = await fetchUrls(type);
            }

    
            fetchedResults = results;
            displayResults(results, type);
        } catch (error) {
            console.error('Error:', error);
            alert(error.message || 'An error occurred while fetching URLs');
        } finally {
            loadingSpinner.style.display = 'none';
            resultsSection.style.display = 'block';
        }
    }

    // Event listeners
    fetchButton.addEventListener('click', () => handleFetch('rt'));
    checkBrokenLinksButton.addEventListener('click', () => handleFetch('broken'));
    checkDuplicateDescriptionButton.addEventListener('click', () => handleFetch('seo'));
    fetchCustomerStoriesButton.addEventListener('click', () => handleFetch('customer-stories'));
});