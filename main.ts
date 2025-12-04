/**
 * Deno Proxy Server (v2.0)
 * 支持 Google Gemini, Groq, HuggingFace Router, Pollinations
 */
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

    // 路径检查 (Pollinations 可能不需要 path，所以这里放宽一点，或者由前端保证)
    if (!proxyPath && targetApi !== 'pollinations') {
      return new Response(JSON.stringify({ error: "Missing x-proxy-path header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 确定目标 API
    let baseUrl = "https://generativelanguage.googleapis.com"; // 默认 Google

    switch (targetApi) {
      case "groq":
        baseUrl = "https://api.groq.com";
        break;
      case "huggingface-router":
        baseUrl = "https://router.huggingface.co";
        break;
      case "pollinations":
        baseUrl = "https://image.pollinations.ai";
        break;
      case "google":
      default:
        baseUrl = "https://generativelanguage.googleapis.com";
        break;
    }
    
    // 拼接最终 URL
    // 注意: Pollinations 的 path 已经在 proxyPath 里了 (e.g. /prompt/...)
    // url.search 会包含 ?key=xxx (Google) 或 ?width=... (Pollinations)
    const finalUrl = baseUrl + (proxyPath || "") + url.search;

    console.log(`[Deno] Target: ${targetApi} | Proxying to: ${finalUrl}`);

    // 清洗 Headers (去除 Deno 自身或者 Cloudflare 转发带来的干扰头)
    const newHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const k = key.toLowerCase();
      if (!['host', 'content-length', 'connection', 'x-forwarded-for', 'x-proxy-path', 'x-target-api'].includes(k)) {
        newHeaders.set(key, value);
      }
    }

    // 发起请求
    // Deno fetch 支持流式传输，body 可以是 ReadableStream
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: newHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: "follow"
    });

    // 处理响应头
    const resHeaders = new Headers(response.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    
    // 针对 SSE 流式传输，确保 Content-Type 正确
    if (targetApi !== 'pollinations' && !resHeaders.get("Content-Type")) {
        resHeaders.set("Content-Type", "application/json");
    }

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });

  } catch (e: any) {
    console.error(`[Proxy Error] ${e.message}`);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
});
