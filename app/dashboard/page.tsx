"use client";
import { useEffect, useState } from "react";

type Inspection = {
  _id: string;
  plate: string;
  position: string;
  images: string[];
  depths: number[];
  ip: string;
  createdAt: string;
};

export default function DashboardPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/inspections");
    const data = await res.json();
    setInspections(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta inspección?")) return;

    setDeleting(id);
    const res = await fetch("/api/inspections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(`Error al eliminar: ${data.error || "Error desconocido"}`);
    }

    await fetchData();
    setDeleting(null);
  };

  if (loading) 
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading inspections...</p>
        </div>
      </div>
    );

  const grouped = inspections.reduce((acc: Record<string, Inspection[]>, i) => {
    const day = new Date(i.createdAt).toLocaleDateString();
    acc[day] = acc[day] ? [...acc[day], i] : [i];
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent mb-2">
            Panel de Inspecciones
          </h1>
          <p className="text-slate-600">Administra y revisa tus inspecciones vehiculares</p>
        </div>

        {inspections.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-500 text-lg">No se encontraron inspecciones</p>
          </div>
        )}

        {Object.entries(grouped).map(([day, dayInspections]) => (
          <div key={day} className="mb-10">
            {/* Day Header */}
            <div className="flex items-center mb-6">
              <div className="bg-white rounded-lg shadow-sm px-4 py-2 border-l-4 border-blue-500">
                <h2 className="text-xl font-semibold text-slate-800">{day}</h2>
                <p className="text-sm text-slate-500">{dayInspections.length} inspección{dayInspections.length !== 1 ? 'es' : ''}</p>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent ml-4"></div>
            </div>

            {/* Inspections Grid */}
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              {dayInspections.map((insp) => (
                <div
                  key={insp._id}
                  className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-100 overflow-hidden group"
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-white font-bold text-lg">Placa: {insp.plate}</h3>
                        <h3 className="text-white font-bold text-lg">Posición: {insp.position}</h3>
                        <p className="text-blue-100 text-sm">
                          {new Date(insp.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(insp._id)}
                        disabled={deleting === insp._id}
                        className="bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white px-4 py-2 rounded-xl transition-colors duration-200 shadow-lg disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {deleting === insp._id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Eliminando...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Eliminar
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Inspection Details */}
                    <div className="grid sm:grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4" />
                          </svg>
                          <span className="font-medium text-slate-700">Profundidades</span>
                        </div>
                        <p className="text-slate-600">{insp.depths.join(", ")} mm</p>
                      </div>
                      
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium text-slate-700">Dirección IP</span>
                        </div>
                        <p className="text-slate-600 font-mono text-sm">{insp.ip}</p>
                      </div>
                    </div>

                    {/* Images Section */}
                    {insp.images.filter(img => img).length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium text-slate-700">Imágenes de Inspección</span>
                          <span className="bg-purple-100 text-purple-600 px-2 py-1 rounded-full text-xs font-medium">
                            {insp.images.filter(img => img).length}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {insp.images.map((img, idx) =>
                            img ? (
                              <div key={idx} className="group relative">
                                <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 shadow-md hover:shadow-lg transition-shadow duration-300">
                                  <img
                                    src={img}
                                    alt={`Inspección ${idx + 1}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      target.nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                  <div className="hidden absolute inset-0 flex items-center justify-center bg-slate-100">
                                    <div className="text-center">
                                      <svg className="w-8 h-8 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <p className="text-xs text-slate-500">Error al cargar</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <a
                                    href={img}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white text-slate-700 px-3 py-1 rounded-lg shadow-lg hover:bg-slate-50 transition-colors duration-200 text-sm font-medium"
                                  >
                                    Ver Completa
                                  </a>
                                </div>
                                <div className="absolute top-2 right-2 bg-white bg-opacity-90 text-slate-600 px-2 py-1 rounded-lg text-xs font-medium">
                                  {idx + 1}
                                </div>
                              </div>
                            ) : null
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}