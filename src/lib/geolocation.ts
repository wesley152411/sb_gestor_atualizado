// Geocodificação reversa centralizada: converte a posição do GPS em "Cidade - UF".
// Usada no cadastro e em Configurações (fonte única, sem duplicar lógica).
// Provedor: Nominatim (OpenStreetMap) — gratuito e sem chave de API.

export interface GeoResult {
  city: string;
  uf: string;
  label: string; // "Belo Horizonte - MG" (ou só a cidade, se a UF não vier)
  lat: number;
  lon: number;
}

// Nomes completos dos estados -> sigla (fallback caso o Nominatim não traga o ISO).
const STATE_TO_UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA',
  'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO',
  'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS',
  'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP',
  'Sergipe': 'SE', 'Tocantins': 'TO',
};

// Envolve navigator.geolocation.getCurrentPosition numa Promise, com timeout.
function getCurrentPositionAsync(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocalização não é suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// Chama o Nominatim e monta "Cidade - UF" a partir das coordenadas.
export async function reverseGeocode(lat: number, lon: number): Promise<GeoResult> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1` +
    `&lat=${lat}&lon=${lon}&accept-language=pt-BR`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Não foi possível converter a localização (sem conexão). Digite a cidade manualmente.');
  }
  if (!res.ok) {
    throw new Error('O serviço de localização falhou. Tente novamente ou digite a cidade manualmente.');
  }

  const data = await res.json();
  const a = (data?.address || {}) as Record<string, string>;

  const city =
    a.city || a.town || a.village || a.municipality || a.county || a.suburb || a.city_district || '';

  let uf = '';
  const iso = a['ISO3166-2-lvl4']; // ex.: "BR-MG"
  if (iso && iso.includes('-')) {
    uf = iso.split('-').pop() || '';
  } else if (a.state) {
    uf = STATE_TO_UF[a.state] || '';
  }

  const label = city ? (uf ? `${city} - ${uf}` : city) : '';
  if (!label) {
    throw new Error('Não foi possível identificar a cidade. Digite manualmente.');
  }

  return { city, uf, label, lat, lon };
}

// Fluxo completo: pega a posição do GPS e devolve "Cidade - UF".
// Lança mensagens claras para permissão negada / timeout / falha.
export async function detectCity(): Promise<GeoResult> {
  let pos: GeolocationPosition;
  try {
    pos = await getCurrentPositionAsync({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  } catch (err) {
    const code = (err as GeolocationPositionError)?.code;
    if (code === 1) throw new Error('Permissão de localização negada. Digite a cidade manualmente.');
    if (code === 2) throw new Error('Localização indisponível no momento. Digite a cidade manualmente.');
    if (code === 3) throw new Error('Tempo esgotado ao obter a localização. Tente novamente ou digite manualmente.');
    throw new Error('Não foi possível obter sua localização. Digite a cidade manualmente.');
  }
  return reverseGeocode(pos.coords.latitude, pos.coords.longitude);
}
