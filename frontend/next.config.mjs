/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Proxy all /api/* requests to the Flask backend.
   *
   * This avoids CORS entirely — the browser only ever talks to Next.js,
   * and Next.js forwards the requests server-side to Flask.
   *
   * Override the Flask URL with the FLASK_API_URL environment variable,
   * e.g. in .env.local:  FLASK_API_URL=http://192.168.1.10:5000
   */
  async rewrites() {
    const flaskUrl = process.env.FLASK_API_URL ?? "http://localhost:5001";
    return [
      {
        source: "/api/:path*",
        destination: `${flaskUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
