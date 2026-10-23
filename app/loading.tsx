// 탭을 누르면 서버가 데이터를 다 모을 때까지 이전 화면이 그대로 멈춰 있어 눌렸는지 알 수 없었다.
// 이 화면이 있으면 누르는 즉시 위 메뉴는 그대로 두고 아래만 불러오는 중 표시로 바뀐다.
export default function Loading() {
  return (
    <div className="min-h-[60vh] bg-[color:var(--color-bg)] px-4 py-6" aria-busy="true" aria-label="불러오는 중">
      <div className="mx-auto max-w-5xl space-y-3 animate-pulse">
        <div className="h-5 w-40 rounded bg-gray-200" />
        <div className="h-16 rounded bg-gray-100" />
        <div className="h-16 rounded bg-gray-100" />
        <div className="h-16 rounded bg-gray-100" />
      </div>
    </div>
  );
}
