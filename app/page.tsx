"use client";

import { useState } from "react";
import type { TireData } from "@/lib/types";

export default function Page() {
  const [placa, setPlaca] = useState("");
  const [paso, setPaso] = useState<"placa" | "llantas">("placa");
  const [llantas, setLlantas] = useState<TireData[]>([
    { images: [null, null, null], depths: ["", "", ""], position: "" },
  ]);
  const [estado, setEstado] = useState<"exito" | "error" | "cargando" | "">("");
  const [mostrarPopup, setMostrarPopup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [examplePopup, setExamplePopup] = useState<{ show: boolean; image: string; title: string }>({ 
    show: false, 
    image: "", 
    title: "" 
  });

  function showExampleImage(imageUrl: string, title: string) {
    setExamplePopup({ show: true, image: imageUrl, title });
  }

  function closeExamplePopup() {
    setExamplePopup({ show: false, image: "", title: "" });
  }

  function handleAgregarLlantas() {
    setLlantas((prev) => [...prev, { images: [null, null, null], depths: ["", "", ""], position: "" }]);
  }

  function handleImagenCambio(indexLlantas: number, indexImg: number, archivo: File | null) {
    setLlantas((prev) => {
      const actualizadas = [...prev];
      actualizadas[indexLlantas].images[indexImg] = archivo;
      return actualizadas;
    });
  }

  function handleProfundidadCambio(indexLlantas: number, indexProf: number, valor: string) {
    if (valor === "" || (/^\d+(\.\d+)?$/.test(valor) && parseFloat(valor) >= 0)) {
      setLlantas((prev) => {
        const actualizadas = [...prev];
        actualizadas[indexLlantas].depths[indexProf] = valor;
        return actualizadas;
      });
    }
  }

  function handlePositionCambio(indexLlantas: number, valor: string) {
    setLlantas((prev) => {
      const actualizadas = [...prev];
      actualizadas[indexLlantas].position = valor;
      return actualizadas;
    });
  }

  // Optimized upload function with batching and parallel processing
  async function uploadInBatches(files: File[], urls: { uploadUrl: string; key: string }[], batchSize = 6) {
    const results = [];
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchUrls = urls.slice(i, i + batchSize);
      
      // Upload batch in parallel
      const batchPromises = batch.map(async (file, idx) => {
        const globalIdx = i + idx;
        try {
          const response = await fetch(batchUrls[idx].uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload file ${globalIdx + 1}`);
          }
          
          setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return { success: true, index: globalIdx };
        } catch (error) {
          console.error(`Error uploading file ${globalIdx + 1}:`, error);
          return { success: false, index: globalIdx, error };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the server
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  async function handleEnviarTodo(e: React.FormEvent) {
    e.preventDefault();

    // Validation checks
    const faltanImagenes = llantas.some((llanta) =>
      llanta.images.some((img) => img === null)
    );

    if (faltanImagenes) {
      alert("Por favor sube las tres imágenes de cada llanta antes de continuar.");
      return;
    }

    const faltanPosiciones = llantas.some((llanta) => !llanta.position.trim());
    
    if (faltanPosiciones) {
      alert("Por favor especifica la posición de cada llanta antes de continuar.");
      return;
    }

    // Validate that we have at least some depth measurements
    const faltanProfundidades = llantas.some((llanta) => 
      llanta.depths.every(depth => !depth.trim())
    );
    
    if (faltanProfundidades) {
      alert("Por favor ingresa al menos una medida de profundidad para cada llanta.");
      return;
    }

    setEstado("cargando");
    setIsSubmitting(true);
    setMostrarPopup(true);
    
    const totalFiles = llantas.length * 3;
    setUploadProgress({ current: 0, total: totalFiles });

    try {
      // 1️⃣ Request pre-signed URLs from backend
      const filesMeta = llantas.flatMap((llanta, tIndex) =>
        llanta.images.map((file, imgIndex) => ({
          name: `tire-${tIndex + 1}-${imgIndex + 1}-${Date.now()}-${file!.name}`,
          type: file!.type,
        }))
      );

      const presignRes = await fetch("/api/get-presigned-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: placa, files: filesMeta }),
      });

      if (!presignRes.ok) {
        throw new Error("Failed to get pre-signed URLs");
      }

      const { urls } = await presignRes.json();

      // 2️⃣ Upload files in optimized batches
      const allFiles = llantas.flatMap((llanta) => llanta.images) as File[];
      const uploadResults = await uploadInBatches(allFiles, urls, 6);
      
      // Check for upload failures
      const failedUploads = uploadResults.filter(result => !result.success);
      if (failedUploads.length > 0) {
        throw new Error(`Failed to upload ${failedUploads.length} files`);
      }

      // 3️⃣ Prepare tires data to send to /api/submit
      const tiresData = llantas.map((llanta, tIndex) => ({
        keys: llanta.images.map((_, imgIndex) => urls[tIndex * 3 + imgIndex].key),
        depths: llanta.depths.filter(d => d.trim() !== ""), // Remove empty depths
        position: llanta.position.trim(),
      }));

      console.log("Sending data to backend:", { plate: placa, tires: tiresData });

      // 4️⃣ Save to backend (MongoDB & email)
      const submitRes = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: placa, tires: tiresData }),
      });

      const submitData = await submitRes.json();
      console.log("Backend response:", submitData);

      if (!submitRes.ok) {
        throw new Error(submitData.error || "Failed to submit data to backend");
      }

      setEstado("exito");
    } catch (err) {
      console.error("Submission error:", err);
      setEstado("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetrySubmit() {
    setMostrarPopup(false);
    setEstado("");
    setUploadProgress({ current: 0, total: 0 });
  }

  function handleNuevoFormulario() {
    setPlaca("");
    setPaso("placa");
    setLlantas([{ images: [null, null, null], depths: ["", "", ""], position: "" }]);
    setEstado("");
    setMostrarPopup(false);
    setUploadProgress({ current: 0, total: 0 });
  }

  function handleClosePopup() {
    setMostrarPopup(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light text-gray-800 tracking-wide">Merquellantas</h1>
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
            
            {/* Photo Recommendations */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-6">
              <h3 className="text-lg font-medium text-blue-800 mb-3">📸 Recomendaciones para las fotos</h3>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>• Asegúrate que no se vean las otras llantas</li>
                <li>• La banda de la llanta debe ser claramente visible</li>
                <li>• Que no tenga piedras o polvo</li>
                <li>• Toma las fotos con buena iluminación</li>
                <li>• Mantén la cámara estable para evitar fotos borrosas</li>
              </ul>
            </div>

            {llantas.map((llanta, tIndex) => (
              <div key={tIndex} className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="text-lg font-light text-gray-700 mb-6 text-center">
                  Llanta {tIndex + 1}
                </h3>

                {/* Position Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Posición de la llanta
                  </label>
                  <input
                    type="number"
                    placeholder="Ej: Delantera Izquierda, Trasera Derecha, Repuesto, etc."
                    value={llanta.position}
                    onChange={(e) => handlePositionCambio(tIndex, e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-black"
                  />
                </div>

                {/* Images */}
                <h2 className="text-gray-700 mb-2">Imagenes: </h2>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { 
                      angle: "costado y banda", 
                      label: "Interna",
                      example: "https://tirepro-train.s3.us-east-1.amazonaws.com/tires/GYY909/tire-1-1758295642410-tire-1-1-1000001352.jpg"
                    },
                    { 
                      angle: "banda", 
                      label: "Centro",
                      example: "https://tirepro-train.s3.us-east-1.amazonaws.com/tires/GYY909/tire-2-1758295642410-tire-1-2-1000001342.jpg"
                    },
                    { 
                      angle: "costado", 
                      label: "Externa",
                      example: "https://tirepro-train.s3.us-east-1.amazonaws.com/tires/GYY909/tire-6-1758295642411-tire-2-3-1000001356.jpg"
                    }
                  ].map(({ angle, label, example }, i) => (
                    <div key={i} className="text-center">
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-700 mb-1">{angle}</p>
                      </div>
                      
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
                      
                      {/* Example Image Thumbnail */}
                      <div className="mt-2 flex flex-col items-center">
                        <div 
                          className="w-16 h-12 border border-gray-300 rounded-lg overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                          onClick={() => showExampleImage(example, `Ejemplo: ${label} (${angle})`)}
                        >
                          <img
                            src={example}
                            alt={`Ejemplo ${label}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline"
                              onClick={() => showExampleImage(example, `Ejemplo: ${label} (${angle})`)}>
                          Ver ejemplo
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <h2 className="text-gray-700 mb-2">Profundidades: </h2>

                {/* Depths */}
                <div className="grid grid-cols-3 gap-4">
                  {["Interna", "Centro", "Externa"].map((label, i) => (
                    <div>
                    <input
                      key={i}
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="mm"
                      value={llanta.depths[i]}
                      onChange={(e) => handleProfundidadCambio(tIndex, i, e.target.value)}
                      className="text-center p-3 border-0 border-b border-gray-200 focus:border-blue-500 focus:outline-none bg-gray-50 rounded-t-lg text-black"
                    />
                    <p className="text-gray-700 font-xs">{label}</p>
                    </div>
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
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-xl font-semibold text-white transition ${
                  isSubmitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      ></path>
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  "Enviar Todo"
                )}
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
                  <p className="text-gray-600 mb-2">Subiendo datos...</p>
                  {uploadProgress.total > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  )}
                  <p className="text-sm text-gray-500">
                    {uploadProgress.current} de {uploadProgress.total} archivos
                  </p>
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
                  <p className="text-red-600 font-medium mb-2">Ocurrió un error al guardar.</p>
                  <p className="text-sm text-gray-500">Puedes intentar enviar nuevamente.</p>
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
                {estado === "error" && (
                  <button
                    onClick={handleRetrySubmit}
                    className="px-6 py-2 bg-blue-500 text-white rounded-full font-light hover:bg-blue-600 transition-colors"
                  >
                    Reintentar
                  </button>
                )}
                <button
                  onClick={handleClosePopup}
                  className="px-6 py-2 bg-gray-100 text-gray-600 rounded-full font-light hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Example Image Popup */}
        {examplePopup.show && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-2xl max-h-[90vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-800">{examplePopup.title}</h3>
                <button
                  onClick={closeExamplePopup}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div className="flex justify-center">
                <img
                  src={examplePopup.image}
                  alt={examplePopup.title}
                  className="max-w-full max-h-96 object-contain rounded-lg"
                />
              </div>
              <div className="mt-4 text-center">
                <button
                  onClick={closeExamplePopup}
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