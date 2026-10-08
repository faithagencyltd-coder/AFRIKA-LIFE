// Textes de l'interface (français). Point d'entrée unique pour la future traduction (P6).
export const fr = {
  app: {
    name: "West Africa Life",
    short: "WA Life",
    tagline: "Construis ta vie en Afrique de l'Ouest.",
  },
  auth: {
    signIn: "Se connecter",
    signUp: "Créer un compte",
    signOut: "Se déconnecter",
    email: "Adresse e-mail",
    password: "Mot de passe",
    google: "Continuer avec Google",
    checkEmail: "Compte créé : ouvrez le lien reçu par e-mail pour l'activer, puis connectez-vous.",
  },
  game: {
    tabs: { here: "Ici", map: "Carte", phone: "Téléphone", me: "Moi" },
    busy: "En cours",
    closed: "Fermé",
    open: "Ouvert",
    free: "Gratuit",
    youAreHere: "Vous êtes ici",
    homeCategories: {
      chambre: "Chambre",
      studio: "Studio",
      appartement: "Appartement",
      villa: "Villa",
      maison_luxe: "Maison de luxe",
      penthouse: "Penthouse",
    },
  },
} as const;
