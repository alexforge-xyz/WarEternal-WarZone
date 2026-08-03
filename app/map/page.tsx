import { redirect } from "next/navigation";

/** Old bookmark `/map` → home map at `/`. */
export default function Page() {
  redirect("/");
}
