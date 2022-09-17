import { Flex, Heading } from '@chakra-ui/react'
import HeroMain from '../components/hero/HeroMain'

export const Hero = ({ title }: { title: string }) => (
  <>
  SUP
  <HeroMain />
  </>
)

Hero.defaultProps = {
  title: 'with-chakra-ui-typescript',
}
