/**
 * Deno Proxy Server (v3.1)
 * 
 * Logic:
 * - Pollinations: Fetches image -> Converts to Base64 -> Returns JSON.
 * - Others: Standard stream proxying.
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
      return new Response(JSON.stringify({ error: "Missing x-proxy-path" }), { status: 400 });
    }

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

    const newHeaders = new Headers();
    for (const [k, v] of req.headers.entries()) {
      if (!['host', 'x-proxy-path', 'x-target-api', 'cf-connecting-ip', 'content-length', 'accept-encoding'].includes(k.toLowerCase())) {
        newHeaders.set(k, v);
      }
    }
    // 伪装 User-Agent 防止画图被拦截
    newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // === 画图特殊处理：Deno 端完成转码 ===
    if (targetApi === 'pollinations') {
        const imgResp = await fetch(finalUrl, { method: req.method, headers: newHeaders });
        
        if (!imgResp.ok) {
            const errText = await imgResp.text();
            throw new Error(`Pollinations API Error (${imgResp.status}): ${errText}`);
        }

        const arrayBuffer = await imgResp.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        return new Response(JSON.stringify({ 
            image: `data:image/jpeg;base64,${base64}`
        }), {
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            }
        });
    }

    // === 常规流式代理 ===
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: newHeaders,
      body: req.method !== 'GET' ? req.body : undefined,
      redirect: "follow"
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    if (!resHeaders.get("Content-Type")) resHeaders.set("Content-Type", "application/json");

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
