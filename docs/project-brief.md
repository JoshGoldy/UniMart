**# UniMart Project Brief**

**## Client**

**Student Representative Council, University of Pretoria**

**## Problem Statement**

**Students struggle to buy/sell second-hand goods on campus.**

**WhatsApp groups are cluttered and unsafe.**

**## Proposed Solution**

**A web app with:**

**- Secure student login (email verification)**

**- Categorised listings (Textbooks, Electronics, etc.)**

**- Seller dashboard with analytics**

**- Trade / swap support**

**- SA public consumer price data integration for item price suggestions**

**## SA Data Integration Backlog Note**

**Chosen source:** Statistics South Africa ISIbalo Data Portal Consumer Price Index downloads, including CPI Average Prices All urban and CPI COICOP files.

**Justification:** The source is public, South African, official, regularly updated, and organised by consumer goods categories that can be mapped to UniMart marketplace categories such as textbooks, electronics, furniture, clothing, and study material.

**Implementation approach:** UniMart uses this public data as a category-level pricing anchor, then adjusts the displayed resale guidance by item condition and item keywords. The app shows sellers a suggested price range instead of a fixed price so they can still account for brand, age, photos, accessories, and urgency.

**Detailed note:** `docs/sa-data-price-suggestions.md`

**## MVP Scope**

**1. Auth (sign-up, email OTP, login)**

**2. Marketplace search page**

**3. Seller dashboard**

**4. Profile management**
