/** @type {import('next').NextConfig} */
const nextConfig = {
    // The development server and the production build use separate output
    // directories. Without this, running `npm run build` while `npm run dev`
    // is running replaces the dev server's assets and every page ends up
    // without its JavaScript and CSS (404 on /_next/static/*).
    distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
    images: {
        domains: [
            "files.edgestore.dev"
        ]
    }
};

export default nextConfig;
