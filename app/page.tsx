"use client";

import { useState } from "react";

// Type definition for tire data
type TireData = {
  images: (File | null)[];
  depths: string[];
  position: string;
};

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
      llanta.images
        .map((file, imgIndex) =>
          file
            ? {
                name: `tire-${tIndex + 1}-${imgIndex + 1}-${Date.now()}-${file.name}`,
                type: file.type,
                tIndex,
                imgIndex,
              }
            : null
        )
        .filter(Boolean) as { name: string; type: string; tIndex: number; imgIndex: number }[]
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
      const allFiles = llantas.flatMap((llanta) =>
      llanta.images.filter((f): f is File => f !== null)
    );

    const uploadResults = await uploadInBatches(allFiles, urls, 6);
      
      // Check for upload failures
      const failedUploads = uploadResults.filter(result => !result.success);
      if (failedUploads.length > 0) {
        throw new Error(`Failed to upload ${failedUploads.length} files`);
      }

      // 3️⃣ Prepare tires data to send to /api/submit
      const tiresData = llantas.map((llanta, tIndex) => ({
        keys: filesMeta
      .filter((meta) => meta.tIndex === tIndex)
      .map((meta, i) => urls[i].key),
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-3 sm:p-4 md:p-6">
      <div className="w-full max-w-4xl">
        
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 md:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-gray-800 tracking-wide">Merquellantas</h1>
          <div className="w-20 sm:w-24 h-1 bg-blue-500 mx-auto mt-3 rounded-full"></div>
        </div>

        {/* Placa Step */}
        {paso === "placa" && (
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-6 sm:p-8 md:p-10 text-center max-w-md mx-auto">
            <h2 className="text-lg sm:text-xl md:text-2xl text-black mb-6 sm:mb-8 font-light">
              Ingrese la placa del vehículo
            </h2>
            <input
              type="text"
              placeholder="Placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              className="w-full text-center text-base sm:text-lg md:text-xl p-3 sm:p-4 border-0 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none bg-transparent mb-6 sm:mb-8 text-black transition-colors"
            />
            <button
              onClick={() => placa.trim() && setPaso("llantas")}
              disabled={!placa.trim()}
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-blue-500 text-white rounded-full font-light disabled:bg-gray-300 transition-all hover:bg-blue-600 hover:shadow-lg text-base sm:text-lg"
            >
              Continuar
            </button>
          </div>
        )}

        {/* Llantas Step */}
        {paso === "llantas" && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* Photo Recommendations */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-medium text-blue-800 mb-3 flex items-center">
                <span className="text-xl sm:text-2xl mr-2">📸</span>
                Recomendaciones para las fotos
              </h3>
              <ul className="text-sm sm:text-base text-blue-700 space-y-1 sm:space-y-2 grid gap-1 sm:gap-2">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 mt-1">•</span>
                  Asegúrate que no se vean las otras llantas
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 mt-1">•</span>
                  La banda de la llanta debe ser claramente visible
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 mt-1">•</span>
                  Que no tenga piedras o polvo
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 mt-1">•</span>
                  Toma las fotos con buena iluminación
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 mt-1">•</span>
                  Mantén la cámara estable para evitar fotos borrosas
                </li>
              </ul>
            </div>

            {llantas.map((llanta, tIndex) => (
              <div key={tIndex} className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 md:p-8">
                <h3 className="text-lg sm:text-xl md:text-2xl font-light text-gray-700 mb-4 sm:mb-6 text-center">
                  Llanta {tIndex + 1}
                </h3>

                {/* Position Input */}
                <div className="mb-4 sm:mb-6">
                  <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2 sm:mb-3">
                    Posición de la llanta
                  </label>
                  <input
                    type="number"
                    placeholder="Ej: 1"
                    value={llanta.position}
                    onChange={(e) => handlePositionCambio(tIndex, e.target.value)}
                    className="w-full p-3 sm:p-4 border border-gray-200 rounded-xl sm:rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-black transition-all text-sm sm:text-base"
                  />
                </div>

                {/* Images Section */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="text-base sm:text-lg font-medium text-gray-700 mb-3 sm:mb-4">
                    Imágenes
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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
                        <div className="mb-2 sm:mb-3">

                          <p className="text-xs sm:text-sm text-gray-500">{angle}</p>
                        </div>
                        
                        <label className="block cursor-pointer group">
                          <div className="w-full h-32 sm:h-36 md:h-40 border-2 border-dashed border-gray-200 rounded-xl sm:rounded-2xl flex items-center justify-center hover:border-blue-300 group-hover:bg-blue-50 transition-all duration-200">
                            {llanta.images[i] ? (
                              <img
                                src={URL.createObjectURL(llanta.images[i]!)}
                                alt={label}
                                className="w-full h-full object-cover rounded-xl sm:rounded-2xl"
                              />
                            ) : (
                              <div className="text-center">
                                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                </svg>
                                <span className="text-gray-400 text-xs sm:text-sm font-medium">Foto</span>
                              </div>
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
                        <div className="mt-2 sm:mt-3 flex flex-col items-center">
                          <div 
                            className="w-12 h-9 sm:w-16 sm:h-12 border border-gray-300 rounded-lg overflow-hidden cursor-pointer hover:border-blue-400 hover:shadow-md transition-all duration-200"
                            onClick={() => showExampleImage(example, `Ejemplo: ${label} (${angle})`)}
                          >
                            <img
                              src={example}
                              alt={`Ejemplo ${label}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span 
                            className="text-xs sm:text-sm text-blue-600 mt-1 cursor-pointer hover:underline hover:text-blue-700 transition-colors"
                            onClick={() => showExampleImage(example, `Ejemplo: ${label} (${angle})`)}
                          >
                            Ver ejemplo
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Depths Section */}
                <div>
                  <h4 className="text-base sm:text-lg font-medium text-gray-700 mb-3 sm:mb-4">
                    Profundidades (mm)
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                    {["Interna", "Centro", "Externa"].map((label, i) => (
                      <div key={i} className="text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          placeholder="0.0"
                          value={llanta.depths[i]}
                          onChange={(e) => handleProfundidadCambio(tIndex, i, e.target.value)}
                          className="w-full text-center p-2 sm:p-3 md:p-4 border-0 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none bg-gray-50 rounded-t-lg text-black transition-colors text-sm sm:text-base"
                        />
                        <p className="text-xs sm:text-sm font-medium text-gray-600 mt-1 sm:mt-2">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-6">
              <button
                type="button"
                onClick={handleAgregarLlantas}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 border-2 border-blue-500 text-blue-500 rounded-full sm:rounded-2xl font-medium hover:bg-blue-50 hover:shadow-lg transition-all duration-200 text-sm sm:text-base"
              >
                + Agregar Llanta
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                onClick={handleEnviarTodo}
                className={`w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 rounded-full sm:rounded-2xl font-semibold text-white transition-all duration-200 text-sm sm:text-base ${
                  isSubmitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
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
          </div>
        )}

        {/* Main Popup */}
        {mostrarPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center max-w-sm sm:max-w-md w-full mx-4 shadow-2xl">
              {estado === "cargando" && (
                <div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4 sm:mb-6"></div>
                  <p className="text-gray-600 mb-3 sm:mb-4 text-base sm:text-lg font-medium">Subiendo datos...</p>
                  {uploadProgress.total > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 mb-3 sm:mb-4">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 sm:h-3 rounded-full transition-all duration-500" 
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  )}
                  <p className="text-sm sm:text-base text-gray-500">
                    {uploadProgress.current} de {uploadProgress.total} archivos
                  </p>
                </div>
              )}
              {estado === "exito" && (
                <div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <p className="text-green-600 font-semibold text-base sm:text-lg mb-2">¡Datos guardados con éxito!</p>
                  <p className="text-sm sm:text-base text-gray-500">La información ha sido procesada correctamente.</p>
                </div>
              )}
              {estado === "error" && (
                <div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </div>
                  <p className="text-red-600 font-semibold text-base sm:text-lg mb-2">Ocurrió un error al guardar</p>
                  <p className="text-sm sm:text-base text-gray-500">Puedes intentar enviar nuevamente o contactar soporte.</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6 sm:mt-8">
                {estado === "exito" && (
                  <button
                    onClick={handleNuevoFormulario}
                    className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 transition-all duration-200 text-sm sm:text-base"
                  >
                    Nuevo Formulario
                  </button>
                )}
                {estado === "error" && (
                  <button
                    onClick={handleRetrySubmit}
                    className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 transition-all duration-200 text-sm sm:text-base"
                  >
                    Reintentar
                  </button>
                )}
                <button
                  onClick={handleClosePopup}
                  className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-600 rounded-full font-medium hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Example Image Popup */}
        {examplePopup.show && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-xs sm:max-w-2xl md:max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 pr-4">{examplePopup.title}</h3>
                <button
                  onClick={closeExamplePopup}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div className="flex justify-center mb-4 sm:mb-6">
                <img
                  src={examplePopup.image}
                  alt={examplePopup.title}
                  className="max-w-full max-h-64 sm:max-h-96 md:max-h-[500px] object-contain rounded-lg shadow-lg"
                />
              </div>
              <div className="text-center">
                <button
                  onClick={closeExamplePopup}
                  className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-600 rounded-full font-medium hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base"
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