/** @type {import('next').NextConfig} */
const nextConfig = {
   
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        process.env.NEXT_PUBLIC_URL,
        "testtxncdn.payubiz.in",
        "txncdn.payubiz.in",
      ]
    }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src',
    }
    config.module.exprContextCritical = false;  
    return config
    

  },
 
}

export default nextConfig