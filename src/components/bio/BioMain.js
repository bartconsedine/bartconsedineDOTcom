import {
    Flex,
    Heading,
    Image,
    Box
} from '@chakra-ui/react'
import Headings from '../misc/Headings'

import { Zoom } from "react-awesome-reveal"

const BioMain = () => {
    return (
        <Flex 
            padding={["2em",null,"0 20em 0 5em" ]}
            direction="column" 
            margin={["5em 0 0 0 ", null,"0 0"]}
            >
            <Zoom>
                <Headings title="career bio"/>
                <Flex 
                    fontSize={[".85em",null,"1.1em"]}
                    marginTop={["1em",null,"2em"]} 
                    direction="column">
                    I began my career in digital advertising and worked at a variety of start-ups, advertising agencies, and had a few entrepreneurial pursuits.  I served as a co-founder and Chief Marketing Officer of QuiBids.com, an auction website that I was able to help grow to $220M in revenue / year while personally executing an average of $150K / day in paid media.  After exiting QuiBids, I stayed in the digital advertising space while cultivating my skills in Software Engineering.  In August of 2019, I completed a Software Engineering Immersive program at General Assembly in New York City and began working as a Software Engineer for Advertising Technology companies.  Pivoting to Software Engineering was the riskiest, but most rewarding decision I have ever made in my career, and has allowed me to cultivate my growth mindset by facing new challenges on a daily basis.  <Box marginTop="1em"></Box>I made the decision to attend NYU's Stern School of Business to pursue an MBA focused in Technology in an effort to continue to learn new skills and explore new industries.  I am looking forward the next chapter in my career where I can pursue my passion of working with talented people on collaborative teams to solve complex problems in the digital space. 
                    
                </Flex>
            </Zoom>

        </Flex>
    )
}

export default BioMain