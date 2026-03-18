"use client";

import { useState } from "react";
import Link from "next/link";
import type { blogPosts as BlogPostsType } from "@/lib/data/blog-posts";

type Post = (typeof BlogPostsType)[number];

type Props = {
  posts: Post[];
  categories: string[];
};

export default function BlogIndexList({ posts, categories }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered =
    activeCategory === "All"
      ? posts
      : posts.filter((p) => p.category === activeCategory);

  return (
    <>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          type="button"
          onClick={() => setActiveCategory("All")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            activeCategory === "All"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
          }`}
        >
          All ({posts.length})
        </button>
        {categories.map((cat) => {
          const count = posts.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === cat
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
              }`}
            >
              {cat} {count > 1 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Posts grid */}
      <div className="grid gap-6 sm:gap-8">
        {filtered.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block border border-slate-200 rounded-xl p-5 sm:p-7 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                {post.category}
              </span>
              <span>{post.readingTime}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors mb-2">
              {post.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 line-clamp-2">
              {post.metaDescription}
            </p>
            <span className="inline-block mt-3 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
              Read guide &rarr;
            </span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-slate-500 py-12">
          No posts in this category yet.
        </p>
      )}
    </>
  );
}
