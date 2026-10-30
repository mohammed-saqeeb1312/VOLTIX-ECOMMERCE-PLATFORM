# VOLTIX Full-Stack Store — Navy & Gold Edition

A premium electronics storefront based on the supplied reference image: deep navy header, champagne-gold accents, warm ivory/cream page background, large hero, two promotional side cards, circular department navigation, dark service strip and six-column product cards.

## Catalogue
- 600 distinct product listings with brand-correct model names (60 per department) and varied category-appropriate product photos.
- 10 departments with exactly 60 products each: Mobiles, Computers, Audio, Wearables, Gaming, Cameras, TV & Appliances, Smart Home, Accessories, Tablets.
- Every department has its own page and paginated listing.
- Search, department filtering and price/rating sorting.

## Stack
- React 18 + Vite + React Router
- Node.js + Express REST API
- SQLite database powered by `sql.js` (WebAssembly; no native C++ build tools or node-gyp required)
- bcrypt password hashing, JWT sessions, Helmet, CORS and rate limiting

## Backend features
- Register, login and authenticated account endpoint.
- Guest cart stored in browser; cart is migrated to the account after sign-in.
- Persistent account cart: add, update quantity, remove items, stock validation.
- Persistent wishlist.
- Demo order placement with shipping validation, stock decrement and order history.
- Admin dashboard summary, product creation/listing, product edit/delete API and order status management.
- SQLite database file is created automatically at `server/data/voltix.sqlite` and persisted after changes.

## Requirements
- Node.js 20+ (Node 22 LTS or Node 24 also suitable)
- npm

## Run on Windows / VS Code
1. Extract the ZIP.
2. Open the `VOLTIX_FullStack_600_Products` folder in VS Code. Make sure this is the folder containing the root `package.json`.
3. Open a terminal in that folder.
4. Install the root runner:
   `npm install`
5. Install backend dependencies:
   `npm install --prefix server`
6. Install frontend dependencies:
   `npm install --prefix client`
7. Create the backend environment file:
   PowerShell: `Copy-Item server/.env.example server/.env`
8. Open `server/.env` and set `JWT_SECRET` to a private random value of at least 32 characters.
9. Start backend and frontend together from the project root:
   `npm run dev`
10. Open `http://localhost:5173`. Backend health check: `http://localhost:5000/api/health`.

The server seeds the 600 demo products automatically on first start. When upgrading an existing local database, it refreshes product details in place (keeping product IDs stable for cart and order references). It creates the SQLite file itself.

Catalogue note: the 600 listings have distinct, brand-matched model names. Each department uses a range of different representative Unsplash product images; these are demo catalogue visuals, not guaranteed exact manufacturer product photography. Prices, ratings and stock are sample data.

## Make an account an admin
For safety, public registration never grants admin privileges. Register your account normally, then open `server/data/voltix.sqlite` in a SQLite database viewer and run:
`UPDATE users SET role='admin' WHERE email='your-email@example.com';`
Sign out and sign in again so the new JWT contains the admin role. Admin dashboard: `http://localhost:5173/admin`.

## Demo / production notes
- Cart, guest cart, account cart, wishlist and database order records work locally.
- Checkout currently records a demo order and reduces inventory; it does not collect money. Integrate a payment provider (e.g. Razorpay) before accepting real orders.
- Catalogue names, prices, inventory, ratings and review counts are generated sample data. They are not live merchant listings or verified reviews.
- Some product cards use representative category imagery rather than exact manufacturer product shots. Replace with licensed product photography before public launch.
- For production deployment, use HTTPS, a strong secret, persistent storage/backups for the SQLite file, proper admin provisioning, payment gateway verification and email/SMS integrations.
