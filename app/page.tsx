"use client";

import { useState } from "react";
import type { TireData } from "@/lib/types";

export default function Page() {
  const [placa, setPlaca] = useState("");
  const [paso, setPaso] = useState<"placa" | "llantas">("placa");
  const [llantas, setLlantas] = useState<TireData[]>([
    { images: [null, null, null], depths: ["", "", ""] },
  ]);
  const [estado, setEstado] = useState<"exito" | "error" | "cargando" | "">("");
  const [mostrarPopup, setMostrarPopup] = useState(false);

  function handleAgregarLlantas() {
    setLlantas((prev) => [...prev, { images: [null, null, null], depths: ["", "", ""] }]);
  }

  function handleImagenCambio(indexLlantas: number, indexImg: number, archivo: File | null) {
    setLlantas((prev) => {
      const actualizadas = [...prev];
      actualizadas[indexLlantas].images[indexImg] = archivo;
      return actualizadas;
    });
  }

  function handleProfundidadCambio(indexLlantas: number, indexProf: number, valor: string) {
    setLlantas((prev) => {
      const actualizadas = [...prev];
      actualizadas[indexLlantas].depths[indexProf] = valor;
      return actualizadas;
    });
  }

  async function handleEnviarTodo(e: React.FormEvent) {
    e.preventDefault();

    setEstado("cargando");

    // Convertir imágenes a Base64 antes de enviar
    const llantasConBase64 = await Promise.all(
      llantas.map(async (llanta) => {
        const imagenesBase64 = await Promise.all(
          llanta.images.map(
            (archivo) =>
              new Promise<string | null>((resolve) => {
                if (!archivo) return resolve(null);
                const lector = new FileReader();
                lector.readAsDataURL(archivo);
                lector.onloadend = () => resolve(lector.result as string);
              })
          )
        );
        return { ...llanta, images: imagenesBase64 };
      })
    );

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: placa, tires: llantasConBase64 }),
      });

      const data = await res.json();
      if (data.success) {
        setEstado("exito");
      } else {
        setEstado("error");
      }
    } catch (err) {
      setEstado("error");
    }

    setMostrarPopup(true);
  }

  function handleNuevoFormulario() {
    setPlaca("");
    setPaso("placa");
    setLlantas([{ images: [null, null, null], depths: ["", "", ""] }]);
    setEstado("");
    setMostrarPopup(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light text-gray-800 tracking-wide">TirePro</h1>
        </div>

        {/* Placa Step */}
        {paso === "placa" && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h2 className="text-xl text-black mb-6 font-light">Ingrese la placa del vehículo</h2>
            <input
              type="text"
              placeholder="Placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              className="w-full text-center text-lg p-4 border-0 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none bg-transparent mb-8 text-black"
            />
            <button
              onClick={() => placa.trim() && setPaso("llantas")}
              disabled={!placa.trim()}
              className="px-8 py-3 bg-blue-500 text-white rounded-full font-light disabled:bg-gray-300 transition-colors hover:bg-blue-600"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Llantas Step */}
        {paso === "llantas" && (
          <form onSubmit={handleEnviarTodo} className="space-y-6">
            {llantas.map((llanta, tIndex) => (
              <div key={tIndex} className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="text-lg font-light text-gray-700 mb-6 text-center">
                  Llanta {tIndex + 1}
                </h3>

                {/* Images */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {["Interna", "Centro", "Externa"].map((label, i) => (
                    <div key={i} className="text-center">
                      <p className="text-sm text-gray-500 mb-3">{label}</p>
                      <label className="block cursor-pointer">
                        <div className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-gray-300 transition-colors">
                          {llanta.images[i] ? (
                            <img
                              src={URL.createObjectURL(llanta.images[i]!)}
                              alt={label}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          ) : (
                            <span className="text-gray-400 text-sm">+ Foto</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleImagenCambio(tIndex, i, e.target.files?.[0] || null)
                          }
                          className="hidden"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                {/* Depths */}
                <div className="grid grid-cols-3 gap-4">
                  {["Interna", "Centro", "Externa"].map((label, i) => (
                    <input
                      key={i}
                      type="number"
                      placeholder="mm"
                      value={llanta.depths[i]}
                      onChange={(e) => handleProfundidadCambio(tIndex, i, e.target.value)}
                      className="text-center p-3 border-0 border-b border-gray-200 focus:border-blue-500 focus:outline-none bg-gray-50 rounded-t-lg text-black"
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center pt-4">
              <button
                type="button"
                onClick={handleAgregarLlantas}
                className="px-6 py-3 border border-blue-500 text-blue-500 rounded-full font-light hover:bg-blue-50 transition-colors"
              >
                + Agregar Llanta
              </button>
              <button 
                type="submit" 
                className="px-8 py-3 bg-blue-500 text-white rounded-full font-light hover:bg-blue-600 transition-colors"
              >
                Enviar Todo
              </button>
            </div>
          </form>
        )}

        {/* Popup */}
        {mostrarPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full">
              {estado === "cargando" && (
                <div>
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600">Subiendo datos...</p>
                </div>
              )}
              {estado === "exito" && (
                <div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">¡Datos guardados con éxito!</p>
                </div>
              )}
              {estado === "error" && (
                <div>
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </div>
                  <p className="text-red-600 font-medium">Ocurrió un error al guardar.</p>
                </div>
              )}

              <div className="flex gap-3 justify-center mt-6">
                {estado === "exito" && (
                  <button
                    onClick={handleNuevoFormulario}
                    className="px-6 py-2 bg-blue-500 text-white rounded-full font-light hover:bg-blue-600 transition-colors"
                  >
                    Nuevo Formulario
                  </button>
                )}
                <button
                  onClick={() => setMostrarPopup(false)}
                  className="px-6 py-2 bg-gray-100 text-gray-600 rounded-full font-light hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}