import fs from "fs/promises";
import path from "path";

/**
 * YORUM FIRSAT TARAYICISI
 *
 * Neden var: 83 takipçili bir hesapta kendi gönderin kimseye ulaşmıyor.
 * Buna karşılık 3 Ağustos 2026'da rakip gönderisine yazılan tek yorum,
 * 70 tepki alan bir gönderinin en üst yorumu oldu — tüm gönderilerin
 * toplamından fazla kişiye ulaştı. Ağ 500 bağlantıyı geçene kadar en
 * verimli kanal gönderi değil yorum.
 *
 * ÖNEMLİ — KAZIMA SINIRI:
 * Bu modül LinkedIn'i KAZIMAZ. Sunucudan LinkedIn kazımak hesap askıya
 * alınma riski taşıyor. Gönderi verisi `data/yakalanan-gonderiler.json`
 * dosyasından okunur; o dosyayı Cenk'in kendi tarayıcı oturumundan çalışan
 * tarama besler (veya elle doldurulur).
 */

export interface WatchedAccount {
  ad: string;
  slug: string;
  tip: "kisi" | "sirket";
  kurum?: string;
  unvan?: string;
  oncelik: number;
  takipci?: number;
  not?: string;
  son_gonderi_id?: string | null;
}

export interface CapturedPost {
  /** urn:li:activity içindeki sayısal ID */
  id: string;
  /** Hesabın slug'ı — takip listesiyle eşleşmeli */
  slug: string;
  yazar: string;
  metin: string;
  /** Gönderi yaşı (saat). Bilinmiyorsa boş bırak. */
  yasSaat?: number;
  tepki?: number;
  yorum?: number;
  paylasim?: number;
}

export interface Opportunity {
  post: CapturedPost;
  hesap: WatchedAccount;
  url: string;
  skor: number;
  gerekce: string[];
}

const WATCHLIST_PATH = path.join(process.cwd(), "data", "takip-listesi.json");
const CAPTURED_PATH = path.join(process.cwd(), "data", "yakalanan-gonderiler.json");

export function postUrl(id: string): string {
  return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
}

export async function loadWatchlist(): Promise<WatchedAccount[]> {
  const raw = await fs.readFile(WATCHLIST_PATH, "utf-8");
  const parsed = JSON.parse(raw) as { hesaplar: WatchedAccount[] };
  return parsed.hesaplar;
}

export async function loadCapturedPosts(): Promise<CapturedPost[]> {
  try {
    const raw = await fs.readFile(CAPTURED_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { gonderiler?: CapturedPost[] };
    return parsed.gonderiler ?? [];
  } catch {
    console.log("📭 data/yakalanan-gonderiler.json yok veya boş.");
    return [];
  }
}

/** Takip listesindeki "son görülen gönderi" kaydını günceller. */
export async function markPostSeen(slug: string, postId: string): Promise<void> {
  const raw = await fs.readFile(WATCHLIST_PATH, "utf-8");
  const parsed = JSON.parse(raw) as { hesaplar: WatchedAccount[] };
  const hesap = parsed.hesaplar.find((h) => h.slug === slug);
  if (!hesap) return;
  hesap.son_gonderi_id = postId;
  await fs.writeFile(WATCHLIST_PATH, JSON.stringify(parsed, null, 2), "utf-8");
}

/**
 * Gönderi okura DOĞRUDAN soru soruyor mu?
 *
 * Bu, puanlamadaki en yüksek ağırlıklı sinyal: "Siz ne eklerdiniz?" tipi
 * kapanışlar yoruma davetli giriş sağlıyor, yanıt alma olasılığı belirgin
 * yüksek oluyor.
 *
 * İlk sürüm fazla dardı ve `Siz bu listeye hangi maddeyi eklerdiniz?`
 * cümlesini kaçırdı (arada kelime olunca eşleşmiyordu). Artık iki yoldan
 * tespit ediliyor: (1) açık davet kalıpları, (2) metnin sonunda soru işareti
 * + ikinci tekil/çoğul şahıs eki.
 */
export function detectReaderQuestion(metin: string): {
  davet: boolean;
  sebep: string;
} {
  const t = metin.toLocaleLowerCase("tr-TR");

  // 1) Açık davet kalıpları
  const kaliplar: Array<[RegExp, string]> = [
    [/\bsizce\b/, "sizce"],
    [/\bne\s+dersiniz\b/, "ne dersiniz"],
    [/\byorumlarda\b/, "yorumlarda"],
    [/\bsiz\b[^?.!]{0,60}\?/, "siz ... ?"],
    [/\bsizin\b[^?.!]{0,60}\?/, "sizin ... ?"],
    [/\bhangi(si)?\b[^?.!]{0,60}\?/, "hangi ... ?"],
    [/\bkat[ıi]l[ıi]yor\s+musunuz\b/, "katılıyor musunuz"],
    [/\bpayla[şs][ıi]n\b/, "paylaşın"],
    [/\byazar\s*m[ıi]s[ıi]n[ıi]z\b/, "yazar mısınız"],
    [/\bsiz\s+olsan[ıi]z\b/, "siz olsanız"],
  ];
  for (const [re, ad] of kaliplar) {
    if (re.test(t)) return { davet: true, sebep: ad };
  }

  // 2) Kapanışta okura yöneltilmiş soru
  //    Son 220 karakterde soru işareti + 2. şahıs eki/zamiri
  const kuyruk = t.slice(-220);
  if (kuyruk.includes("?")) {
    const ikinciSahis =
      /\b(siz|sizi|size|sizin)\b|(d[ıi]n[ıi]z|d[uü]n[uü]z|s[ıi]n[ıi]z|sunuz|s[uü]n[uü]z|[ıi]n[ıi]z|un[uu]z)\s*\?/.test(
        kuyruk,
      );
    if (ikinciSahis) return { davet: true, sebep: "kapanışta okura soru" };
  }

  return { davet: false, sebep: "" };
}

/**
 * Bir gönderinin yorum fırsatı olarak değerini puanlar.
 *
 * Ağırlıklar sahada gözlemlenen davranışa dayanıyor:
 * - Soru soran gönderiler davetli giriş sağlıyor (Atiye'nin checklist gönderisi
 *   "Siz hangi maddeyi eklerdiniz?" ile bitti ve yorum bekliyordu).
 * - İlk saatler kritik; 6 saati geçen gönderide yorum görünmüyor.
 * - Öncelik 1 hesaplar en yüksek erişimi olanlar.
 */
export function scoreOpportunity(
  post: CapturedPost,
  hesap: WatchedAccount,
): { skor: number; gerekce: string[] } {
  let skor = 0;
  const gerekce: string[] = [];

  // Hesap önceliği: 1 → +40, 2 → +25, 3 → +10, 4 → 0
  const oncelikPuan: Record<number, number> = { 1: 40, 2: 25, 3: 10, 4: 0 };
  const op = oncelikPuan[hesap.oncelik] ?? 0;
  skor += op;
  if (op > 0) gerekce.push(`Öncelik ${hesap.oncelik} hesap (+${op})`);

  // Soru soruyor mu — en güçlü sinyal, en yüksek ağırlık
  const { davet, sebep } = detectReaderQuestion(post.metin);
  if (davet) {
    skor += 35;
    gerekce.push(`Okura soru soruyor — davetli giriş (+35, ${sebep})`);
  } else if ((post.metin.match(/\?/g) || []).length >= 2) {
    skor += 15;
    gerekce.push("Metinde soru var (+15)");
  }

  // Tazelik
  if (typeof post.yasSaat === "number") {
    if (post.yasSaat <= 1) {
      skor += 30;
      gerekce.push("İlk 1 saat — en yüksek görünürlük (+30)");
    } else if (post.yasSaat <= 3) {
      skor += 20;
      gerekce.push("3 saatten yeni (+20)");
    } else if (post.yasSaat <= 6) {
      skor += 8;
      gerekce.push("6 saatten yeni (+8)");
    } else {
      gerekce.push("6 saatten eski — yorum görünürlüğü düşük (+0)");
    }
  }

  // Etkileşim hacmi: gönderi ne kadar yayılıyorsa yorum o kadar çok kişiye ulaşır
  const tepki = post.tepki ?? 0;
  if (tepki >= 50) {
    skor += 20;
    gerekce.push(`Yüksek etkileşim (${tepki} tepki) (+20)`);
  } else if (tepki >= 15) {
    skor += 10;
    gerekce.push(`Orta etkileşim (${tepki} tepki) (+10)`);
  }

  // Kalabalıklaşmış yorum alanı değerini düşürür
  const yorum = post.yorum ?? 0;
  if (yorum >= 15) {
    skor -= 10;
    gerekce.push(`Yorum alanı kalabalık (${yorum}) (-10)`);
  }

  return { skor, gerekce };
}

/**
 * Yakalanan gönderiler içinden daha önce görülmemiş olanları seçer,
 * puanlar ve yüksekten düşüğe sıralar.
 */
export async function findOpportunities(): Promise<Opportunity[]> {
  const [hesaplar, posts] = await Promise.all([
    loadWatchlist(),
    loadCapturedPosts(),
  ]);

  const bySlug = new Map(hesaplar.map((h) => [h.slug, h]));
  const firsatlar: Opportunity[] = [];
  const elenen = { slugYok: 0, gorulmus: 0, kisaMetin: 0 };

  console.log(
    `📥 ${posts.length} yakalanan gönderi, ${hesaplar.length} takip edilen hesap.`,
  );

  for (const post of posts) {
    const hesap = bySlug.get(post.slug);
    if (!hesap) {
      console.warn(`⚠️ Takip listesinde olmayan slug atlandı: ${post.slug}`);
      elenen.slugYok++;
      continue;
    }
    if (hesap.son_gonderi_id && hesap.son_gonderi_id === post.id) {
      console.log(
        `⏭️  ${hesap.ad}: ${post.id} daha önce işlenmiş (takip listesindeki son_gonderi_id ile aynı).`,
      );
      elenen.gorulmus++;
      continue;
    }
    if (!post.metin || post.metin.trim().length < 40) {
      console.log(`⏭️  ${hesap.ad}: metin çok kısa, yorum yazılamaz.`);
      elenen.kisaMetin++;
      continue;
    }

    const { skor, gerekce } = scoreOpportunity(post, hesap);
    console.log(`   • ${hesap.ad} → skor ${skor} (${gerekce.join(", ")})`);
    firsatlar.push({ post, hesap, url: postUrl(post.id), skor, gerekce });
  }

  if (firsatlar.length === 0 && posts.length > 0) {
    console.log(
      `ℹ️ Aday çıkmadı — elenenler: ${elenen.gorulmus} zaten işlenmiş, ` +
        `${elenen.slugYok} listede yok, ${elenen.kisaMetin} metni kısa.`,
    );
  }

  firsatlar.sort((a, b) => b.skor - a.skor);
  return firsatlar;
}
