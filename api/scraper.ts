// api/scraper.ts (VERSÃO LIMPA E CORRETA)

import { IncomingMessage, ServerResponse } from 'http';
import puppeteer from 'puppeteer-core';
import chrome from 'chrome-aws-lambda';

// A função de extração que vai rodar DENTRO do navegador robô
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    const url = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('url');

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required.' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: chrome.args,
            executablePath: await chrome.executablePath,
            headless: chrome.headless,
        });

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        await page.goto(url, { waitUntil: 'networkidle2' });

        const data = await page.evaluate(scrapePageLogic);
        
        await browser.close();
        
        return res.status(200).json(data);

    } catch (error: any) {
        if (browser) await browser.close();
        return res.status(500).json({ error: `Server-side scraping failed: ${error.message}` });
    }
}