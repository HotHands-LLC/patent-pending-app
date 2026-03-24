export async function getPatentStatus(applicationNumber: string) {
  const apiKey = process.env.USPTO_ODP_API_KEY
  if (!apiKey || !applicationNumber) return null
  try {
    const res = await fetch(
      `https://api.uspto.gov/api/v1/patent/applications/${applicationNumber}`,
      { headers: { 'X-API-KEY': apiKey } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.patentFileWrapperDataBag?.[0] ?? null
  } catch {
    return null
  }
}
