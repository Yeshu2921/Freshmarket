const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export async function loadDynamicFavicon() {
  try {
    const response = await fetch(`${API_BASE}/homepage/logo`);

    if (!response.ok) {
      throw new Error("Failed to load website logo");
    }

    const data = await response.json();
    const logo = data.logo;

    if (!logo?.image_path) return;

    const imageUrl = /^https?:\/\//i.test(logo.image_path)
      ? logo.image_path
      : `${API_ORIGIN}/${logo.image_path.replace(/^\/+/, "")}`;

    const favicon = document.getElementById("dynamic-favicon");

    if (favicon) {
      favicon.href = imageUrl;
    }
  } catch (error) {
    console.error("Favicon loading error:", error);
  }
}
