import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);

  // 1. 处理 CORS 预检
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // 2. 核心代理逻辑
  try {
    const proxyPath = req.headers.get("x-proxy-path");
    const targetApi = req.headers.get("x-target-api");

    // 路径检查
    if (!proxyPath) {
      return new Response(JSON.stringify({ error: "Missing x-proxy-path header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 确定目标 API
    let baseUrl = "https://generativelanguage.googleapis.com"; // 默认 Google
    if (targetApi === "groq") baseUrl = "https://api.groq.com";
    
    // 拼接最终 URL (保留原始 URL 的 query 参数，比如 ?key=xxx)
    const finalUrl = baseUrl + proxyPath + url.search;

    console.log(`[Deno] Proxying to: ${finalUrl}`);

    // 清洗 Headers
    const newHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
      if (!['host', 'content-length', 'connection', 'x-forwarded-for'].includes(key.toLowerCase())) {
        newHeaders.set(key, value);
      }
    }

    // 发起请求 (Deno 支持流式传输，非常适合大文件)
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: newHeaders,
      body: req.body, // 直接透传流，不读取内存
    });

    // 处理响应头
    const resHeaders = new Headers(response.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
});
