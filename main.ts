/**
 * Deno Proxy Server (v2.3 Image Binary Fix)
 * Fixes: Binary stream handling for Pollinations & Groq routing
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
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

    let baseUrl = "";
    switch (targetApi) {
      case "groq": baseUrl = "https://api.groq.com"; break;
      case "huggingface-router": baseUrl = "https://router.huggingface.co"; break;
      case "pollinations": baseUrl = "https://image.pollinations.ai"; break;
      case "google": 
      default: baseUrl = "https://generativelanguage.googleapis.com"; break;
    }

    // 拼接 URL
    const finalUrl = baseUrl + (proxyPath || "") + url.search;
    console.log(`[Proxy] ${targetApi} -> ${finalUrl}`);

    // 清洗请求头
    const newHeaders = new Headers();
    for (const [k, v] of req.headers.entries()) {
      if (!['host', 'x-proxy-path', 'x-target-api', 'cf-connecting-ip', 'content-length'].includes(k.toLowerCase())) {
        newHeaders.set(k, v);
      }
    }
    // 伪装 UA 防止画图被拦截
    newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    const response = await fetch(finalUrl, {
      method: req.method,
      headers: newHeaders,
      body: req.method !== 'GET' ? req.body : undefined,
      redirect: "follow"
    });

    // 处理响应头
    const resHeaders = new Headers(response.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");

    // 【关键修复】如果是画图，强制确保 Content-Type 正确，否则 Worker 可能无法解析 blob
    if (targetApi === 'pollinations' && response.ok) {
        resHeaders.set("Content-Type", "image/jpeg");
    } else if (!resHeaders.get("Content-Type")) {
        resHeaders.set("Content-Type", "application/json");
    }

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Deno Proxy Error: ${e.message}` }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  }
});
