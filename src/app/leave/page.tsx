'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db, getCurrentUser } from '@/lib/database';
import { toast } from '@/lib/toast';
import { 
  CalendarDays, 
  User,
  Calendar,
  Loader2,
  FileText,
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function LeaveRequestPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Trạng thái Form xin nghỉ
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Mặc định chọn ngày bắt đầu từ ngày mai
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    setStartDate(dateStr);
    setEndDate(dateStr);

    setCurrentUser(getCurrentUser());
  }, []);

  const loadRequests = async (userId: string) => {
    try {
      const allReqs = await db.getLeaveRequests();
      // Lọc các yêu cầu nghỉ phép của riêng user hiện tại
      const userReqs = allReqs.filter(r => r.user_id === userId);
      setRequests(userReqs);
    } catch (e) {
      console.error('Lỗi khi tải lịch sử xin nghỉ:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadRequests(currentUser.id);
    }

    const unsub = db.subscribeToAttendanceChanges(() => {
      if (currentUser) {
        loadRequests(currentUser.id);
      }
    });

    return () => {
      unsub();
    };
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
      return;
    }

    setSubmitting(true);
    try {
      await db.createLeaveRequest({
        user_id: currentUser.id,
        start_date: startDate,
        end_date: endDate,
        reason
      });

      confetti({
        particleCount: 80,
        spread: 50,
        origin: { y: 0.8 }
      });

      // Reset form
      setReason('');
      
      // Load lại lịch sử
      await loadRequests(currentUser.id);
      toast.success('Gửi đơn xin nghỉ phép thành công! Vui lòng đợi Admin duyệt.');
    } catch (err) {
      console.error(err);
      toast.error('Gửi đơn thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <Link 
        href="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold hover:bg-coffee-light transition shadow-sm w-fit animate-fade-in"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về Trang chủ</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* FORM ĐĂNG KÝ (2/3) */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-coffee-light space-y-4">
          <h3 className="font-extrabold text-xl text-coffee-dark flex items-center space-x-2">
            <CalendarDays className="w-6 h-6 text-coffee-primary" />
            <span>Đăng ký Xin Nghỉ Phép</span>
          </h3>
          <p className="text-xs text-coffee-medium">
            Điền đầy đủ khoảng thời gian và lý do nghỉ phép. Gửi trực tiếp lên hệ thống để Admin duyệt.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Ngày bắt đầu */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-coffee-medium uppercase">Từ ngày</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-11 bg-[#FAF6F0] px-4 py-0 rounded-2xl text-xs border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark block"
                  required
                />
              </div>

              {/* Ngày kết thúc */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-coffee-medium uppercase">Đến ngày</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-11 bg-[#FAF6F0] px-4 py-0 rounded-2xl text-xs border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark block"
                  required
                />
              </div>
            </div>

            {/* Lý do */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-coffee-medium uppercase">Lý do xin nghỉ</label>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {[
                  'Bận việc gia đình / Việc riêng',
                  'Đi khám sức khỏe / Bị ốm',
                  'Vướng lịch học / Thi cử',
                  'Về quê / Có việc đột xuất'
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      reason === preset
                        ? 'bg-coffee-primary text-white border-coffee-primary shadow-xs'
                        : 'bg-[#FAF6F0] text-coffee-dark border-coffee-light hover:bg-coffee-light/50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Bận việc gia đình, Đi khám sức khỏe,..."
                rows={3}
                className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl text-xs border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark placeholder-coffee-medium"
                required
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-4 text-white font-bold text-xs rounded-2xl transition shadow-md bg-coffee-primary hover:bg-coffee-dark shadow-coffee-primary/20`}
            >
              {submitting ? 'Đang gửi đơn...' : 'Gửi Đơn Xin Nghỉ Phép'}
            </button>
          </form>
        </div>
      </div>

      {/* LỊCH SỬ XIN NGHỈ PHÉP (1/3) */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-coffee-light space-y-4">
          <h3 className="font-extrabold text-lg text-coffee-dark flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-coffee-primary" />
            <span>Lịch sử nghỉ phép</span>
          </h3>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 text-coffee-primary animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 text-coffee-medium/60 text-xs space-y-2">
                <CalendarDays className="w-8 h-8 mx-auto opacity-40" />
                <p>Chưa gửi yêu cầu nghỉ phép nào</p>
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="p-4 bg-[#FAF6F0] rounded-2xl border border-coffee-light space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-coffee-medium flex items-center">
                      <User className="w-3.5 h-3.5 mr-1" />
                      <span>{currentUser?.full_name}</span>
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      req.status === 'Đã duyệt' 
                        ? 'bg-green-100 text-green-800' 
                        : req.status === 'Từ chối'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {req.status}
                    </span>
                  </div>

                  <div className="text-xs text-coffee-dark space-y-1.5">
                    <p className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 text-coffee-medium" />
                      <span>Nghỉ: <strong>{new Date(req.start_date).toLocaleDateString('vi-VN')}</strong> đến <strong>{new Date(req.end_date).toLocaleDateString('vi-VN')}</strong></span>
                    </p>
                    <p className="flex items-start">
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-coffee-medium shrink-0 mt-0.5" />
                      <span>Lý do: <span className="font-medium text-coffee-medium">{req.reason}</span></span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
