/**
 * Deno Proxy Server (v2.1 Image Gen Fix)
 * 支持: Google, Groq, HuggingFace, Pollinations
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  // 1. CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const proxyPath = req.headers.get("x-proxy-path");
    const targetApi = req.headers.get("x-target-api");

    if (!proxyPath && targetApi !== 'pollinations') {
      return new Response(JSON.stringify({ error: "Missing headers" }), { status: 400 });
    }

    // 2. 路由选择
    let baseUrl = "";
    switch (targetApi) {
      case "groq": baseUrl = "https://api.groq.com"; break;
      case "huggingface-router": baseUrl = "https://router.huggingface.co"; break;
      case "pollinations": baseUrl = "https://image.pollinations.ai"; break;
      case "google": 
      default: baseUrl = "https://generativelanguage.googleapis.com"; break;
    }

    const finalUrl = baseUrl + (proxyPath || "") + url.search;
    console.log(`[Proxy] ${targetApi} -> ${finalUrl}`);

    // 3. 构建请求头
    const newHeaders = new Headers();
    for (const [k, v] of req.headers.entries()) {
      if (!['host', 'x-proxy-path', 'x-target-api'].includes(k.toLowerCase())) {
        newHeaders.set(k, v);
      }
    }
    // 伪装 UA，防止被画图接口拦截
    newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // 4. 发起请求
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: newHeaders,
      body: req.method !== 'GET' ? req.body : undefined,
      redirect: "follow"
    });

    // 5. 处理响应
    const resHeaders = new Headers(response.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");

    // 针对图片的特殊处理 (确保 Content-Type 透传)
    if (targetApi === 'pollinations') {
        // Pollinations 有时返回 JPEG 有时返回 JSON 错误
    } else {
        if (!resHeaders.get("Content-Type")) resHeaders.set("Content-Type", "application/json");
    }

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  }
});
