// Funzione Vercel: GET /api/trending?category=Fitness
// Legge i video in tendenza da YouTube. La chiave segreta sta nelle variabili d'ambiente di Vercel.
const QUERIES = {
  Fitness: 'allenamento workout fitness',
  Tech: 'intelligenza artificiale tecnologia novità',
  Finanza: 'borsa trading investimenti',
  Architettura: 'architettura design interni',
  Ingegneria: 'ingegneria cantiere costruzioni',
  DIY: 'fai da te bricolage',
  Kids: 'cartoni animati canzoni per bambini',
};
const API = 'https://www.googleapis.com/youtube/v3/';

async function yt(path, params, key) {
  const r = await fetch(API + path + '?' + new URLSearchParams({ ...params, key }));
  if (!r.ok) throw new Error('youtube_' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

const duration = (iso = '') => {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) || [];
  const h = +m[1] || 0, min = +m[2] || 0, s = +m[3] || 0;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
};

module.exports = async (req, res) => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing_key' });
  const category = String((req.query && req.query.category) || 'Fitness');
  if (category !== 'Musica' && !QUERIES[category]) return res.status(400).json({ error: 'bad_category' });
  try {
    const part = 'snippet,contentDetails,statistics';
    let items;
    if (category === 'Musica') {
      // Classifica ufficiale YouTube "Più popolari" per la musica in Italia
      ({ items } = await yt('videos', { part, chart: 'mostPopular', videoCategoryId: '10', regionCode: 'IT', maxResults: '12' }, key));
    } else {
      // Video degli ultimi 7 giorni più visti per quell'argomento
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const s = await yt('search', { part: 'snippet', q: QUERIES[category], type: 'video', order: 'viewCount', publishedAfter: since, regionCode: 'IT', relevanceLanguage: 'it', safeSearch: 'moderate', maxResults: '15' }, key);
      const ids = s.items.map((i) => i.id.videoId).join(',');
      ({ items } = ids ? await yt('videos', { part, id: ids }, key) : { items: [] });
    }
    let videos = items.map((v) => {
      const views = Number(v.statistics && v.statistics.viewCount || 0);
      const days = Math.max((Date.now() - new Date(v.snippet.publishedAt)) / 864e5, 0.5);
      const t = v.snippet.thumbnails || {};
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        thumbnailUrl: (t.high || t.medium || t.default || {}).url || '',
        videoUrl: 'https://www.youtube.com/watch?v=' + v.id,
        duration: duration(v.contentDetails && v.contentDetails.duration),
        views, viewsPerDay: Math.round(views / days), publishedAt: v.snippet.publishedAt,
      };
    });
    if (category !== 'Musica') videos.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
    videos = videos.slice(0, 9);
    // Cache di 6 ore: risparmia la quota gratuita di YouTube
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
    res.status(200).json({ category, updatedAt: new Date().toISOString(), videos });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'youtube_error' });
  }
};
