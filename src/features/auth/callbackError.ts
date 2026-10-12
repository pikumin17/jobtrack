// 招待判定フックが拒否した場合などは、URL に error と error_description が付いて戻ってくる。
export function readError(location: Pick<Location, 'search' | 'hash'>): 'not_invited' | 'other' | null {
  const params = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const error = params.get('error') ?? hash.get('error')
  if (!error) return null
  const description = `${params.get('error_description') ?? ''} ${hash.get('error_description') ?? ''}`
  return description.includes('招待') || description.toLowerCase().includes('not invited') ? 'not_invited' : 'other'
}
