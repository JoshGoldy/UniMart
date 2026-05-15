# SA Data Integration: Item Price Suggestions

## Backlog Decision

UniMart will use Statistics South Africa's public Consumer Price Index data, specifically the ISIbalo Data Portal Consumer Price Index downloads, as the public South African data source for category-informed item price suggestions.

Chosen source:
- Statistics South Africa ISIbalo Data Portal: Consumer Price Index
- Dataset family: CPI Average Prices All urban, CPI COICOP, and related monthly CPI downloads
- URL: https://isibaloweb.statssa.gov.za/pages/surveys/ets/monthly/Consumer%20Price%20Index/cpi.php

## Why This Source Fits

This source is suitable because it is:
- Publicly available and downloadable.
- South African, so suggested prices reflect the local consumer market rather than international pricing.
- Officially maintained by Statistics South Africa.
- Updated monthly through the CPI publication cycle.
- Category-based, using consumer goods groupings that map well to UniMart listing categories such as electronics, textbooks/study material, furniture, clothing, and general household items.

The CPI source does not provide exact second-hand student resale values for every possible item. UniMart therefore uses the public consumer price data as a category anchor, then adjusts the suggested range using item condition and marketplace-friendly resale assumptions.

## Current App Behaviour

When a seller creates or edits a listing, UniMart shows a fair price guide beside the price field. The guide considers:
- Listing category
- Listing condition
- Item keywords in the title, such as laptop, calculator, textbook, desk, chair, shoes, or study notes

The suggestion is presented as a range, not a fixed price, because sellers still need to account for brand, age, accessories, photos, urgency, and campus demand.

## Category Mapping

| UniMart category | Public data category used as guide |
| --- | --- |
| Electronics | Household appliances, communication equipment, and recreation equipment |
| Textbooks | Education and recreation reading material |
| Furniture | Furnishings and household equipment |
| Clothing | Clothing and footwear |
| Notes & Study | Education and stationery-related products |
| Other | Mixed household consumer goods |

## Future Enhancement

The next improvement should periodically import the latest CPI Average Prices workbook and store selected product/category anchors in the app, so the guidance updates automatically rather than relying on the current seeded category ranges.
