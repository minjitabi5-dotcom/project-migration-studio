import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Award, Briefcase, GraduationCap, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { VerificationBadges } from "@/components/creator-credentials";
import { categoryToneClass } from "@/lib/category-colors";
import { formatGuidePrice, parseCreatorProfile } from "@/lib/marketplace-data";

export const Route = createFileRoute("/creators/$creatorId")({
  loader: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.creatorId)) throw notFound();
    const [{ data: profile }, { data: labels }, { data: products }, { data: stats }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, bio, avatar_url, professional_background, years_experience, specializations, achievements, qualifications, created_at")
        .eq("id", params.creatorId)
        .maybeSingle(),
      supabase.from("creator_verifications").select("kind, note").eq("creator_id", params.creatorId),
      supabase
        .from("guides")
        .select("id, slug, title, summary, category, format, price_cents, currency_code")
        .eq("creator_id", params.creatorId)
        .eq("status", "published")
        .not("published_version_id", "is", null)
        .order("published_at", { ascending: false }),
      supabase.rpc("creator_public_stats", { p_creator_id: params.creatorId }),
    ]);
    if (!profile) throw notFound();
    const ids = (products ?? []).map((p) => p.id);
    const { data: reviews } = ids.length
      ? await supabase
          .from("resource_feedback")
          .select("id, guide_id, usefulness, clarity, listing_accuracy, comment, created_at")
          .in("guide_id", ids)
          .eq("status", "visible")
          .order("created_at", { ascending: false })
          .limit(12)
      : { data: [] };
    const statRow = (stats as { products: number; reviews: number; avg_rating: number | null }[] | null)?.[0];
    return { profile, labels: labels ?? [], products: products ?? [], reviews: reviews ?? [], stats: statRow ?? null };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.profile.display_name ?? "Creator";
    const desc = `${name} shares practical know-how on Doerly — background, expertise, products and buyer reviews.`;
    return {
      meta: [
        { title: `${name} | Creator on Doerly` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} | Creator on Doerly` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <main className="market-message">
      <h1>We couldn’t find this creator</h1>
      <Button asChild variant="outline">
        <Link to="/explore" search={{}}>Explore resources</Link>
      </Button>
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="market-message">
      <h1>This profile isn’t available right now</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </main>
  ),
  component: CreatorPage,
});

function CreatorPage() {
  const { profile, labels, products, reviews, stats } = Route.useLoaderData();
  const bio = parseCreatorProfile(profile.bio);
  const specializations = profile.specializations.length ? profile.specializations : bio.expertise;
  const titleById = Object.fromEntries(products.map((p) => [p.id, p]));

  return (
    <main className="creator-page">
      <Button asChild variant="ghost" size="sm">
        <Link to="/explore" search={{}}>
          <ArrowLeft aria-hidden="true" /> Explore
        </Link>
      </Button>
      <header className="creator-page-head">
        {profile.avatar_url ? (
          <img className="creator-page-avatar" src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="creator-avatar is-large">{profile.display_name.slice(0, 1)}</span>
        )}
        <div>
          <p className="eyebrow">Creator profile</p>
          <h1>{profile.display_name}</h1>
          <VerificationBadges labels={labels} />
          <p className="creator-page-stats">
            {profile.years_experience !== null && <span>{profile.years_experience} years’ experience</span>}
            <span>
              {stats?.products ?? products.length} product{(stats?.products ?? products.length) === 1 ? "" : "s"}
            </span>
            {stats && stats.reviews > 0 && (
              <span>
                <Star aria-hidden="true" /> {stats.avg_rating}/5 from {stats.reviews} review{stats.reviews === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="creator-page-grid">
        <div className="creator-page-main">
          {bio.about && <p className="creator-page-about">{bio.about}</p>}
          {(profile.professional_background || bio.experience) && (
            <section>
              <h2>
                <Briefcase aria-hidden="true" /> Professional background
              </h2>
              <p className="pre-line">{profile.professional_background || bio.experience}</p>
            </section>
          )}
          {profile.achievements && (
            <section>
              <h2>
                <Award aria-hidden="true" /> Projects & achievements
              </h2>
              <p className="pre-line">{profile.achievements}</p>
            </section>
          )}
          {profile.qualifications && (
            <section>
              <h2>
                <GraduationCap aria-hidden="true" /> Qualifications
              </h2>
              <p className="pre-line">{profile.qualifications}</p>
            </section>
          )}
          {labels.length === 0 && (
            <p className="creator-profile-note">This background is self-described and not yet verified by Doerly.</p>
          )}
        </div>
        {specializations.length > 0 && (
          <aside className="creator-page-side">
            <h2>Specialises in</h2>
            <ul className="listing-tags">
              {specializations.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <section className="creator-page-products">
        <h2>Knowledge products</h2>
        {products.length === 0 ? (
          <p className="app-muted">No published products yet.</p>
        ) : (
          <ul className="guide-list">
            {products.map((p, i) => (
              <li key={p.id} className="guide-row">
                <span className="guide-row-index">{String(i + 1).padStart(2, "0")}</span>
                <div className="guide-row-main">
                  <p className="guide-meta">
                    <span className={categoryToneClass(p.category)}>{p.category}</span>
                    <span>{p.format}</span>
                  </p>
                  <h3>
                    <Link to="/guide/$slug" params={{ slug: p.slug }}>
                      {p.title}
                    </Link>
                  </h3>
                  <p className="guide-summary">{p.summary}</p>
                </div>
                <div className="guide-row-side">
                  <span className="guide-price">{p.price_cents === 0 ? "Free" : formatGuidePrice(p.price_cents, p.currency_code)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviews.length > 0 && (
        <section className="creator-page-products">
          <h2>What buyers say</h2>
          <ul className="review-list">
            {reviews.map((r) => {
              const avg = Math.round(((r.usefulness + r.clarity + r.listing_accuracy) / 3) * 10) / 10;
              const product = titleById[r.guide_id];
              return (
                <li key={r.id} className="review-item">
                  <div className="review-head">
                    <span className="review-stars" aria-label={`${avg} out of 5`}>
                      {"★★★★★".slice(0, Math.round(avg))}
                      <span className="review-stars-off">{"★★★★★".slice(Math.round(avg))}</span>
                    </span>
                    {product && (
                      <Link to="/guide/$slug" params={{ slug: product.slug }} className="review-product">
                        {product.title}
                      </Link>
                    )}
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  <small>Verified buyer · {new Date(r.created_at).toLocaleDateString()}</small>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
