// api/scraper.ts (VERSÃO FINAL, CORRIGIDA E SEM DUPLICAÇÃO)

import { IncomingMessage, ServerResponse } from 'http';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

// A função de extração (scrapePageLogic) não muda.
const scrapePageLogic = () => {
    const getShowHide = (value: any) => (value && String(value).trim() !== '' ? 'show' : 'hide');
    const finalJson: any[] = [];
    const categoryWrappers = document.querySelectorAll('.subcategory__wrapper-main');

    categoryWrappers.forEach(wrapper => {
        const sectionTitle = (wrapper.querySelector('h3.subcategory__header') as HTMLElement)?.innerText.trim() || '';
        const sectionParagraph = (wrapper.querySelector('.subcategory__description') as HTMLElement)?.innerText.trim() || '';

        if (sectionTitle) finalJson.push({ type: "title", content: sectionTitle });
        if (sectionParagraph) finalJson.push({ type: "paragraph", content: sectionParagraph });

        const products = wrapper.querySelectorAll('.cs-product-tile');
        products.forEach(product => {
            const category = (product.querySelector('.cs-product-tile__category') as HTMLElement)?.innerText.trim() || '';
            const nameLink = product.querySelector('.cs-product-tile__name-link') as HTMLAnchorElement;

            let nameLine1 = '', nameLine2 = '', bio = '', productURL = '';
            if (nameLink) {
                productURL = nameLink.href || '';
                const cloned = nameLink.cloneNode(true) as HTMLElement;
                const spanBio = cloned.querySelector('.bio-product');
                if (spanBio) { bio = (spanBio as HTMLElement).innerText.trim(); spanBio.remove(); }
                cloned.innerHTML = cloned.innerHTML.replace(/<br\s*\/?>/gi, '|||');
                const parts = (cloned.textContent || '').trim().split('|||');
                nameLine1 = parts[0]?.trim() || '';
                nameLine2 = parts[1]?.trim() || '';
            }

            const price = (product.querySelector('.price') as HTMLElement)?.innerText.trim() || '';
            const imgEl = product.querySelector('img.cs-product-tile__image') as HTMLImageElement;
            const imgSrc1 = imgEl?.getAttribute('data-src-1') || imgEl?.getAttribute('src') || '';
            const imgSrc2 = imgEl?.getAttribute('data-src-2') || '';
            const imgSrc3 = imgEl?.getAttribute('data-src-3') || '';

            finalJson.push({
                type: "card",
                content: {
                    Category: category, NameLine1: nameLine1, NameLine2: nameLine2,
                    Bio: bio, ShowBio: getShowHide(bio), Price: price,
                    ImageSrc: imgSrc1, ImageSrc1: imgSrc1, ImageSrc2: imgSrc2, ImageSrc3: imgSrc3,
                    ProductURL: productURL,
                    // Preenchendo campos restantes para evitar erros
                    CategorySubtitle: '', OldPrice: '', ShowDiscount: 'hide', BadgeContent: '', ShowBadge: 'hide',
                    UnitValue: '', ShowUnitValue: 'hide', Weight: '', PricePerWeight: '', ShowPricePerWeight: 'hide',
                }
            });
        });
    });
    return finalJson;
};


// O Handler da Vercel - a função principal da API
export default async function handler(req: IncomingMessage, res: ServerResponse) {
    // 1. Definir cabeçalhos CORS primeiro
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. Lidar com a requisição de verificação CORS
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }
    
    // 3. Pegar a URL do parâmetro da requisição
    const url = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('url');

    // 4. Verificar se a URL foi fornecida
    if (!url) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'URL parameter is required.' }));
    }

    // 5. Agora, iniciar o Puppeteer
    let browser = null;
    try {
        // Tenta aguardar o binário do Chromium estar livre
        let launched = false;
        let launchError = null;
        for (let i = 0; i < 3; i++) {
            try {
                browser = await puppeteer.launch({
                    args: chromium.args,
                    defaultViewport: chromium.defaultViewport,
                    executablePath: await chromium.executablePath(),
                    headless: 'new',
                    ignoreHTTPSErrors: true,
                    env: { ...process.env, TZ: 'UTC' },
                });
                launched = true;
                break;
            } catch (err) {
                launchError = err;
                await new Promise(resolve => setTimeout(resolve, 1000)); // espera 1s
            }
        }
        if (!launched) throw launchError;

        if (browser) {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0' });
            const data = await page.evaluate(scrapePageLogic);
            await browser.close();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(data));
        } else {
            throw new Error('Browser could not be launched.');
        }

    } catch (error: any) {
        if (browser) {
            await browser.close();
        }
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Server-side scraping failed: ${error.message}` }));
    }
}