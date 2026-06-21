import React from 'react';

// Common shimmering base element
const ShimmerBlock = ({ className = '' }: { className?: string }) => (
  <div className={`bg-stone-200/70 animate-pulse rounded ${className}`} />
);

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" id="dashboard-skeleton">
      {/* 1. Sync Status Notice Bar */}
      <div className="p-4 rounded-xl border border-l-4 border-l-stone-300 border-stone-200 bg-stone-50/50 flex items-start gap-3 shadow-sm">
        <ShimmerBlock className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" />
        <div className="flex-grow space-y-2">
          <ShimmerBlock className="w-1/4 h-3.5" />
          <ShimmerBlock className="w-3/4 h-3" />
        </div>
      </div>

      {/* 2. Operational Control Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F2C6CE] pb-1.5">
          <ShimmerBlock className="w-4 h-4" />
          <ShimmerBlock className="w-28 h-3.5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Shift card skeleton */}
          <div className="bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <ShimmerBlock className="w-8 h-8 rounded-lg" />
                <div className="space-y-1.5">
                  <ShimmerBlock className="w-24 h-3" />
                  <ShimmerBlock className="w-16 h-2.5" />
                </div>
              </div>
              <ShimmerBlock className="w-12 h-4 rounded-full" />
            </div>
            <div className="border-t border-[#FAF6F6] pt-3 space-y-2">
              <ShimmerBlock className="w-full h-3" />
              <ShimmerBlock className="w-3/4 h-3" />
            </div>
          </div>

          {/* Queue card skeleton */}
          <div className="bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <ShimmerBlock className="w-8 h-8 rounded-lg" />
                <div className="space-y-1.5">
                  <ShimmerBlock className="w-28 h-3" />
                  <ShimmerBlock className="w-16 h-2.5" />
                </div>
              </div>
              <ShimmerBlock className="w-16 h-4 rounded-full" />
            </div>
            <div className="space-y-2">
              <ShimmerBlock className="w-full h-3" />
              <ShimmerBlock className="w-5/6 h-3" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Business Intelligence Insights Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F2C6CE] pb-1.5">
          <ShimmerBlock className="w-4 h-4" />
          <ShimmerBlock className="w-36 h-3.5" />
        </div>

        {/* Metrics Bento Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#F2C6CE] rounded-xl p-6 shadow-sm flex flex-col justify-between h-44">
              <div className="flex justify-between items-start">
                <ShimmerBlock className="w-10 h-10 rounded-lg" />
                <ShimmerBlock className="w-12 h-4 rounded-full" />
              </div>
              <div className="space-y-2">
                <ShimmerBlock className="w-24 h-2.5" />
                <ShimmerBlock className="w-36 h-6" />
                <ShimmerBlock className="w-20 h-2 mt-1" />
              </div>
            </div>
          ))}
        </div>

        {/* Middle Splits & Demographics & Bookings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm space-y-4 min-h-[220px] flex flex-col justify-between">
              <div className="space-y-3">
                <ShimmerBlock className="w-1/2 h-3.5 border-b border-[#F2C6CE] pb-2" />
                <div className="space-y-2.5 pt-1">
                  <ShimmerBlock className="w-full h-3" />
                  <ShimmerBlock className="w-5/6 h-3" />
                  <ShimmerBlock className="w-4/5 h-3" />
                </div>
              </div>
              <ShimmerBlock className="w-1/3 h-2" />
            </div>
          ))}
        </div>

        {/* Bottom charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart placeholder */}
          <div className="lg:col-span-2 bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm min-h-[300px] flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4 border-b border-[#F2C6CE] pb-2">
              <ShimmerBlock className="w-1/3 h-4" />
              <ShimmerBlock className="w-28 h-6 rounded-lg" />
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              {/* Fake SVG Line chart shimmer */}
              <div className="w-full h-40 border-l border-b border-[#F2C6CE] relative flex items-end justify-between p-2">
                {[20, 40, 60, 30, 80, 50, 90, 70, 45, 60, 85, 95].map((h, idx) => (
                  <div key={idx} className="w-4 bg-stone-200/50 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F2C6CE]/60 flex justify-between">
              <ShimmerBlock className="w-1/2 h-3" />
              <ShimmerBlock className="w-1/4 h-3" />
            </div>
          </div>

          {/* Donut placeholder */}
          <div className="bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[300px]">
            <div className="border-b border-[#F2C6CE] pb-2 mb-3">
              <ShimmerBlock className="w-2/3 h-4" />
            </div>
            <div className="flex flex-col items-center justify-center py-2 flex-grow space-y-4">
              <ShimmerBlock className="w-28 h-28 rounded-full" />
              <div className="w-full space-y-2">
                <ShimmerBlock className="w-full h-6" />
                <ShimmerBlock className="w-full h-6" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function CustomerDBSkeleton() {
  return (
    <div className="space-y-6" id="customer-db-skeleton">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <ShimmerBlock className="w-64 h-5" />
          <ShimmerBlock className="w-96 h-3" />
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <ShimmerBlock className="w-32 h-9 rounded-lg" />
          <ShimmerBlock className="w-40 h-9 rounded-lg" />
        </div>
      </div>

      {/* 2. Main Table Card */}
      <div className="bg-white border border-[#F2C6CE] rounded-xl shadow-sm overflow-hidden">
        {/* Search header bar */}
        <div className="p-4 border-b border-[#F2C6CE] bg-[#FAF6F6] flex items-center justify-between">
          <ShimmerBlock className="w-72 h-8 rounded-full" />
          <ShimmerBlock className="w-40 h-6 rounded-full" />
        </div>

        {/* Data Table Loading Rows */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF6F6]/50 border-b border-[#F2C6CE]">
                <th className="py-3 px-6"><ShimmerBlock className="w-24 h-3" /></th>
                <th className="py-3 px-6"><ShimmerBlock className="w-24 h-3" /></th>
                <th className="py-3 px-6"><ShimmerBlock className="w-24 h-3" /></th>
                <th className="py-3 px-6"><ShimmerBlock className="w-20 h-3" /></th>
                <th className="py-3 px-6 text-right"><ShimmerBlock className="w-12 h-3 ml-auto" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2C6CE]/50">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="group">
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-3">
                      <ShimmerBlock className="w-9 h-9 rounded-full" />
                      <div className="space-y-1.5">
                        <ShimmerBlock className="w-32 h-3.5" />
                        <ShimmerBlock className="w-20 h-2.5" />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-6">
                    <ShimmerBlock className="w-28 h-3.5" />
                  </td>
                  <td className="py-3.5 px-6">
                    <ShimmerBlock className="w-20 h-3.5" />
                  </td>
                  <td className="py-3.5 px-6">
                    <ShimmerBlock className="w-16 h-5 rounded-full" />
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <ShimmerBlock className="w-5 h-5 rounded-full ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-6 py-3.5 bg-surface-container-low border-t border-outline-variant flex justify-between items-center">
          <ShimmerBlock className="w-48 h-3" />
          <div className="flex gap-2">
            <ShimmerBlock className="w-6 h-6 rounded" />
            <ShimmerBlock className="w-6 h-6 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-6" id="reports-skeleton">
      {/* 1. Header */}
      <div className="border-b border-[#F2C6CE] pb-4 flex justify-between items-center">
        <div className="space-y-2">
          <ShimmerBlock className="w-56 h-5" />
          <ShimmerBlock className="w-80 h-3" />
        </div>
        <ShimmerBlock className="w-36 h-9 rounded-lg" />
      </div>

      {/* 2. Metrics summary blocks */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-[#F2C6CE] rounded-xl p-4 shadow-sm space-y-3">
            <ShimmerBlock className="w-20 h-2.5" />
            <ShimmerBlock className="w-28 h-6" />
          </div>
        ))}
      </div>

      {/* 3. Main Report area */}
      <div className="bg-white border border-[#F2C6CE] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-stone-100">
          <ShimmerBlock className="w-40 h-4" />
          <div className="flex gap-2">
            <ShimmerBlock className="w-24 h-7 rounded" />
            <ShimmerBlock className="w-24 h-7 rounded" />
          </div>
        </div>
        {/* Table representation */}
        <div className="space-y-2">
          <ShimmerBlock className="w-full h-8" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ShimmerBlock key={i} className="w-full h-7" />
          ))}
        </div>
      </div>
    </div>
  );
}
