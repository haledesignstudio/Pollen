import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DASHBOARD_API_URL;
  const token = process.env.DASHBOARD_API_TOKEN;

  if (!url || !token) {
    return NextResponse.json(
      { error: "Missing DASHBOARD_API_URL or DASHBOARD_API_TOKEN in environment." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text().catch(() => "");

    if (!res.ok) {
      // This will print in your terminal (npm run dev), not in the browser
      console.error("UPSTREAM ERROR", {
        status: res.status,
        statusText: res.statusText,
        contentType,
        body: raw?.slice(0, 2000),
      });

      return NextResponse.json(
        {
          error: "Upstream API error",
          status: res.status,
        },
        { status: 502 }
      );

    }

    // If upstream returns JSON but content-type is weird, still handle it:
    const data = contentType.includes("application/json") ? JSON.parse(raw) : raw;
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("ROUTE FETCH FAILED", err);
    return NextResponse.json(
      { error: "Failed to reach upstream API", detail: err?.message ?? String(err) },
      { status: 502 }
    );
  }
}
