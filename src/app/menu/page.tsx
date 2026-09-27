'use client';

import React, { useState, useEffect } from 'react';
import { db, getCurrentUser } from '@/lib/database';
import { Coffee, Search, Tag, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function MenuPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    async function loadData() {
      try {
        const [prodData, catData] = await Promise.all([
          db.getProducts(),
          db.getCategories()
        ]);
        setProducts(prodData);
        setCategories(catData);
      } catch (e) {
        console.error('Lỗi khi tải thực đơn:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredProducts = products.filter(prod => {
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          prod.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || prod.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Recipe Inspector Modal State
  const [selectedProductForRecipe, setSelectedProductForRecipe] = useState<any>(null);
  const [productRecipes, setProductRecipes] = useState<any[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const handleOpenRecipeModal = async (prod: any) => {
    setSelectedProductForRecipe(prod);
    setLoadingRecipes(true);
    try {
      const recs = await db.getProductRecipes(prod.id);
      setProductRecipes(recs);
    } catch (e) {
      console.error('Lỗi lấy công thức món:', e);
    } finally {
      setLoadingRecipes(false);
    }
  };

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Tiêu đề trang */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-coffee-light">
        <div>
          <span className="text-xs font-bold text-coffee-medium uppercase tracking-wider">Danh mục sản phẩm</span>
          <h2 className="font-black text-2xl text-coffee-dark flex items-center space-x-2">
            <Coffee className="w-6 h-6 text-coffee-primary" />
            <span>Thực đơn cửa hàng</span>
          </h2>
        </div>
        <Link 
          href="/"
          className="px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold hover:bg-coffee-light flex items-center space-x-2 w-fit transition shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Trang chủ</span>
        </Link>
      </div>

      {/* Tìm kiếm & Lọc */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Hộp tìm kiếm */}
        <div className="relative md:col-span-1">
          <input
            type="text"
            placeholder="Tìm theo tên món hoặc mã (e.g. CP001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-coffee-light focus:border-coffee-primary focus:ring-2 focus:ring-coffee-primary/20 outline-none text-sm text-coffee-dark bg-white transition-all shadow-sm"
          />
          <Search className="w-5 h-5 text-coffee-medium/60 absolute left-3.5 top-3.5" />
        </div>

        {/* Bộ lọc danh mục */}
        <div className="md:col-span-2 flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 shadow-sm ${
              selectedCategory === 'all'
                ? 'bg-coffee-primary text-white'
                : 'bg-white text-coffee-dark border border-coffee-light hover:bg-coffee-light'
            }`}
          >
            Tất cả món
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 shadow-sm ${
                selectedCategory === cat.id
                  ? 'bg-coffee-primary text-white'
                  : 'bg-white text-coffee-dark border border-coffee-light hover:bg-coffee-light'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Hiển thị danh sách món */}
      {loading ? (
        <div className="py-24 flex justify-center">
          <Loader2 className="w-10 h-10 text-coffee-primary animate-spin" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-coffee-light text-center space-y-3">
          <Coffee className="w-12 h-12 text-coffee-medium/30 mx-auto" />
          <p className="font-bold text-coffee-medium">Không tìm thấy món nước nào</p>
          <p className="text-xs text-coffee-medium/80">Thử thay đổi từ khóa hoặc bộ lọc danh mục của bạn.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
          {filteredProducts.map((prod) => {
            const catName = categories.find(c => c.id === prod.category_id)?.name || 'Khác';
            const isOutOfStock = prod.status === 'Hết hàng';

            return (
              <div 
                key={prod.id}
                onClick={() => handleOpenRecipeModal(prod)}
                className={`bg-white rounded-3xl overflow-hidden border border-coffee-light flex flex-col shadow-sm transition-all duration-300 relative cursor-pointer group ${
                  isOutOfStock ? 'opacity-60' : 'hover:-translate-y-1 hover:shadow-lg hover:border-coffee-accent'
                }`}
              >
                {/* Ảnh sản phẩm */}
                <div className="relative h-32 sm:h-44 bg-coffee-light overflow-hidden">
                  {prod.image_url ? (
                    <img 
                      src={prod.image_url} 
                      alt={prod.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logo.jpg';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-coffee-medium">
                      <Coffee className="w-8 h-8 sm:w-12 sm:h-12" />
                    </div>
                  )}
                  <span className={`absolute top-2 right-2 sm:top-3 sm:right-3 text-[8px] sm:text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isOutOfStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {prod.status}
                  </span>
                  <span className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 bg-coffee-dark/80 text-coffee-accent rounded-md">
                    {prod.id}
                  </span>
                </div>

                {/* Chi tiết sản phẩm */}
                <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between space-y-3 sm:space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-coffee-medium uppercase tracking-wide flex items-center">
                      <Tag className="w-3 h-3 mr-1 text-coffee-primary" />
                      {catName}
                    </span>
                    {/* Tên món bự rực rỡ */}
                    <h3 className="font-black text-sm sm:text-lg md:text-xl text-coffee-dark leading-tight group-hover:text-coffee-primary transition">
                      {prod.name}
                    </h3>
                  </div>

                  <div className="pt-3 border-t border-coffee-light/60 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] sm:text-[10px] text-coffee-medium block">
                        {prod.takeaway_price && prod.dinein_price && prod.takeaway_price !== prod.dinein_price
                          ? 'Mang về / Ngồi lại'
                          : 'Giá bán'}
                      </span>
                      <span className="font-black text-xs sm:text-sm md:text-base text-coffee-primary">
                        {prod.takeaway_price && prod.dinein_price && prod.takeaway_price !== prod.dinein_price
                          ? `${prod.takeaway_price.toLocaleString('vi-VN')}đ / ${prod.dinein_price.toLocaleString('vi-VN')}đ`
                          : `${(prod.price || 0).toLocaleString('vi-VN')}đ`}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-coffee-medium group-hover:text-coffee-dark underline underline-offset-2">
                      Công thức 📋
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RECIPE INSPECTOR MODAL */}
      {selectedProductForRecipe && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-coffee-light space-y-4 sm:space-y-5 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex justify-between items-start border-b border-coffee-light">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-coffee-light shrink-0">
                  <img
                    src={selectedProductForRecipe.image_url}
                    alt={selectedProductForRecipe.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/logo.jpg'; }}
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-coffee-medium uppercase">{selectedProductForRecipe.id}</span>
                  <h3 className="font-black text-lg text-coffee-dark leading-tight">{selectedProductForRecipe.name}</h3>
                  <p className="text-xs font-extrabold text-coffee-primary">{selectedProductForRecipe.price?.toLocaleString('vi-VN')}đ</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedProductForRecipe(null)}
                className="p-1 hover:bg-[#FAF6F0] rounded-xl text-coffee-medium transition font-extrabold text-xs"
              >
                Đóng ✖
              </button>
            </div>

            {/* Nội dung công thức */}
            <div className="space-y-3">
              <h4 className="font-extrabold text-xs text-coffee-medium uppercase tracking-wider flex items-center space-x-1.5">
                <span>📋 Công thức pha chế chuẩn (1 ly)</span>
              </h4>

              {loadingRecipes ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 text-coffee-primary animate-spin" />
                </div>
              ) : productRecipes.length === 0 ? (
                <p className="text-xs text-coffee-medium italic py-4 text-center">Chưa có công thức định lượng chi tiết.</p>
              ) : (
                <div className="space-y-2">
                  {productRecipes.map((rec) => (
                    <div key={rec.id} className="p-3 bg-[#FAF6F0] rounded-2xl border border-coffee-light flex items-center justify-between text-xs">
                      <span className="font-bold text-coffee-dark">{rec.ingredient_name}</span>
                      <strong className="font-black text-coffee-primary text-sm">
                        {rec.quantity_needed} {rec.ingredient_unit}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-coffee-medium/70 italic text-center pt-2 border-t border-coffee-light/60">
              * Công thức này dùng để tham khảo định lượng pha chế tại cửa hàng AVA Coffee.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
